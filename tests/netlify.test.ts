import { runWorkflow } from "./helpers/workflow-scenario";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createHmac } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { PGlite } from "@electric-sql/pglite";
import { BlobsServer } from "@netlify/blobs/server";
import { getStore, setEnvironmentContext } from "@netlify/blobs";
import {
  useTestDatabase,
  one,
  run,
  transaction,
  postgresSQL,
} from "../src/lib/storage";
import {
  handle,
  processReviewDeadlines,
  nextMaintenanceTime,
} from "../src/lib/server";
import {
  wakeMaintenance,
  maintenanceState,
  finishMaintenance,
} from "../src/lib/maintenance-state";
import { putUpload, readUpload } from "../src/lib/uploads";
import { blobFetch } from "../src/lib/blob-fetch";
import { emptyProfile } from "../src/lib/shared";
import scheduled from "../netlify/functions/maintenance.mjs";

const directory = mkdtempSync(path.join(tmpdir(), "kounotori-netlify-"));
const postgres = new PGlite();
const blobs = new BlobsServer({
  directory,
  token: "synthetic-token",
  logger: () => {},
});
let txTail: Promise<void> = Promise.resolve();
let databaseReads = 0;
const originalFetch = globalThis.fetch;
const query = async (sql: string, params: any[] = []) => {
  databaseReads++;
  if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
  const result = await postgres.query(sql, params).catch((error) => {
    console.error("Test SQL failure:", error.message, sql);
    throw error;
  });
  return {
    rows: result.rows as any[],
    fields: result.fields,
    rowCount: result.affectedRows || 0,
  };
};
before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    STORAGE_BACKEND: "netlify",
    APP_MODE: "demo",
    PAYMENT_MODE: "demo",
    MAIL_MODE: "preview",
    SMTP_HOST: "",
    SITE_URL: "http://localhost:3000",
  });
  await postgres.exec(
    readFileSync(
      "netlify/database/migrations/202610170001_initial.sql",
      "utf8",
    ),
  );
  await postgres.exec(
    readFileSync(
      "netlify/database/migrations/202610170002_upload_cleanup.sql",
      "utf8",
    ),
  );
  await postgres.exec(
    readFileSync(
      "netlify/database/migrations/202610170003_demo_isolation.sql",
      "utf8",
    ),
  );
  useTestDatabase({
    query,
    connect: async () => {
      const previous = txTail;
      let release!: () => void;
      txTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      return { query, release };
    },
  });
  const { address } = await blobs.start();
  // SDK 11.1.4's local server validates conditional PUTs but omits ETags on GET.
  // Supply that server's filesystem ETag to exercise actual conditional PUTs.
  globalThis.fetch = async (input, options) => {
    const response = await originalFetch(input, options);
    const url = String(input instanceof Request ? input.url : input);
    if (
      url.startsWith(address) &&
      response.ok &&
      (options?.method || "GET").toUpperCase() === "GET"
    ) {
      const parts = new URL(url).pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);
      if (parts[0]?.startsWith("region:")) parts.shift();
      const filePath = path.join(
        directory,
        "entries",
        parts[0],
        ...parts
          .slice(1)
          .map((part) =>
            process.platform === "win32" ? encodeURIComponent(part) : part,
          ),
      );
      try {
        const stats = statSync(filePath);
        if (stats.isFile()) {
          const headers = new Headers(response.headers);
          headers.set(
            "etag",
            '"' +
              createHmac("sha256", stats.mtime.toISOString())
                .update(filePath)
                .digest("hex") +
              '"',
          );
          return new Response(await response.arrayBuffer(), {
            status: response.status,
            headers,
          });
        }
      } catch {}
    }
    return response;
  };
  setEnvironmentContext({
    siteID: "synthetic-site",
    token: "synthetic-token",
    edgeURL: address,
    uncachedEdgeURL: address,
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await blobs.stop();
  await postgres.close();
  rmSync(directory, { recursive: true, force: true });
});

async function call(
  route: string,
  method = "GET",
  data?: unknown,
  cookie = "",
  expected = 200,
) {
  const response = await handle(
    new Request("http://localhost:3000/api/" + route, {
      method,
      headers: {
        Origin: "http://localhost:3000",
        Cookie: cookie,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
    route.split("?")[0].split("/"),
  );
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return {
    ...result,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie,
  };
}

test("Blobs bypass framework fetch in the Netlify runtime", async () => {
  const patchedFetch = globalThis.fetch;
  const previousRuntime = process.env.NETLIFY;
  try {
    process.env.NETLIFY = "true";
    globalThis.fetch = async () => {
      throw new Error("Framework fetch must not handle private blob requests");
    };
    const store = getStore({
      name: "transport-regression",
      consistency: "strong",
      fetch: blobFetch,
    });
    assert.equal(await store.get("missing", { type: "json" }), null);
  } finally {
    globalThis.fetch = patchedFetch;
    if (previousRuntime === undefined) delete process.env.NETLIFY;
    else process.env.NETLIFY = previousRuntime;
  }
});

test("Only an administrator can send an operator mail test", async () => {
  await call("admin/mail-test", "POST", {}, "", 401);
  const recipient = await call("auth/demo", "POST", { role: "recipient" });
  await call("admin/mail-test", "POST", {}, recipient.cookie, 403);
  const admin = await call("auth/demo", "POST", { role: "admin" });
  await call("admin/mail-test", "POST", { to: "untrusted@example.test" }, admin.cookie, 503);
});

test("PostgreSQL: parameter binding, transaction rollback and concurrent commits", async () => {
  assert.equal(
    postgresSQL("SELECT '?' AS literal,? AS value"),
    "SELECT '?' AS literal,$1 AS value",
  );
  assert.equal(
    (await one("SELECT ?::text AS value", "' OR true;--"))!.value,
    "' OR true;--",
  );
  await assert.rejects(
    transaction(async () => {
      await run("INSERT INTO service_leases VALUES(?,?)", "rollback", 1);
      throw new Error("synthetic rollback");
    }),
  );
  assert.equal(
    await one("SELECT * FROM service_leases WHERE key=?", "rollback"),
    undefined,
  );
  await Promise.all(
    Array.from({ length: 8 }, (_, n) =>
      transaction(async () => {
        await run(
          "INSERT OR IGNORE INTO service_leases VALUES(?,?)",
          "concurrent",
          0,
        );
        await run(
          "UPDATE service_leases SET expires_at=expires_at+1 WHERE key=?",
          "concurrent",
        );
      }),
    ),
  );
  assert.equal(
    Number(
      (await one(
        "SELECT expires_at FROM service_leases WHERE key=?",
        "concurrent",
      ))!.expires_at,
    ),
    8,
  );
});

test("Netlify Blobs: strong reads, private file authorization, account deletion removes blobs", async () => {
  const donor = await call("auth/demo", "POST", { role: "donor" });
  const outsider = await call("auth/demo", "POST", { role: "recipient" });
  const fid = "synthetic-certificate",
    key = "synthetic-certificate.pdf";
  await putUpload(key, Buffer.from("%PDF-synthetic"));
  await run(
    "INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)",
    fid,
    "demo_donor1",
    null,
    null,
    "identity",
    key,
    "application/pdf",
    "synthetic.pdf",
    new Date().toISOString(),
  );
  const fetchFile = (cookie = "") =>
    handle(
      new Request("http://localhost:3000/api/files/" + fid, {
        headers: { Cookie: cookie },
      }),
      ["files", fid],
    );
  assert.equal((await fetchFile()).status, 401);
  assert.equal((await fetchFile(outsider.cookie)).status, 404);
  const own = await fetchFile(donor.cookie);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get("Cache-Control"), "private, no-store");
  assert.equal(await own.text(), "%PDF-synthetic");
  await call("account", "DELETE", { confirm: true }, donor.cookie);
  assert.equal(await readUpload(key), null);
  assert.equal(await one("SELECT id FROM files WHERE id=?", fid), undefined);
});

test("PostgreSQL: support access control and admin replies retain their behavior", async () => {
  const owner = await call("auth/demo", "POST", { role: "recipient" });
  const admin = await call("auth/demo", "POST", { role: "admin" });
  const ticket = await call(
    "support",
    "POST",
    { category: "その他", subject: "合成テスト", body: "問い合わせ本文" },
    owner.cookie,
    201,
  );
  await call("support/" + ticket.id, "GET", undefined, "", 404);
  await call(
    "support/" + ticket.id,
    "POST",
    { body: "運営からの回答" },
    admin.cookie,
    201,
  );
  const thread = await call(
    "support/" + ticket.id,
    "GET",
    undefined,
    owner.cookie,
  );
  assert.equal(thread.messages[1].body, "運営からの回答");
});

test("Scheduled maintenance: no idle DB wake, compare-and-swap preserves newly queued work", async () => {
  const current = await maintenanceState();
  if (current) await finishMaintenance(current.etag, Date.now() + 86400000);
  const before = databaseReads;
  await scheduled();
  assert.equal(databaseReads, before);
  await wakeMaintenance(Date.now() + 10000);
  const snapshot = await maintenanceState();
  assert.ok(snapshot);
  // The official local Blobs server derives ETags from filesystem timestamps.
  await new Promise((resolve) => setTimeout(resolve, 30));
  await wakeMaintenance(1);
  assert.notEqual((await maintenanceState())!.etag, snapshot.etag);
  await finishMaintenance(snapshot.etag, null);
  assert.equal((await maintenanceState())!.data.at, 1);
});

test("PostgreSQL + Blobs: full registration/payment/review/disclosure/chat/withdrawal workflow", async () => {
  const signup = (email: string, role: string) =>
    call(
      "auth/signup",
      "POST",
      {
        email,
        role,
        password: "Synthetic-long-pass123!",
        birthDate: "1990-01-01",
        agreed: true,
      },
      "",
      200,
    );
  const upload = async (kind: string, cookie: string, conversationId = "") => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP48OEDAAWkAtEPcc/YAAAAAElFTkSuQmCC",
      "base64",
    );
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", new Blob([png], { type: "image/png" }), "synthetic.png");
    if (conversationId) form.set("conversationId", conversationId);
    const response = await handle(
      new Request("http://localhost:3000/api/files", {
        method: "POST",
        headers: { Origin: "http://localhost:3000", Cookie: cookie },
        body: form,
      }),
      ["files"],
    );
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    return result.file.id as string;
  };
  const fileStatus = async (id: string, cookie = "") =>
    (
      await handle(
        new Request("http://localhost:3000/api/files/" + id, {
          headers: { Cookie: cookie },
        }),
        ["files", id],
      )
    ).status;
  await runWorkflow({
    call,
    signup,
    upload,
    fileStatus,
    assertEmpty: async () => {
      assert.equal(
        (
          await getStore({
            name: "private-uploads-demo",
            consistency: "strong",
          }).list()
        ).blobs.length,
        0,
      );
    },
  });
});
test("PostgreSQL: 30-day approval and certificate deletion are durable and idempotent", async () => {
  const time = Date.now(),
    paidAt = new Date(time - 30 * 86400000).toISOString();
  await run(
    "INSERT INTO applications(id,user_id,kind,data_json,status,paid,created_at,paid_at) VALUES(?,?,?,?,?,?,?,?)",
    "due",
    "demo_donor2",
    "initial",
    JSON.stringify(emptyProfile()),
    "queued",
    1,
    paidAt,
    paidAt,
  );
  await putUpload("due.pdf", Buffer.from("%PDF-synthetic"));
  await run(
    "INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)",
    "due-doc",
    "demo_donor2",
    "due",
    null,
    "identity",
    "due.pdf",
    "application/pdf",
    "doc.pdf",
    paidAt,
  );
  await processReviewDeadlines(time - 1);
  assert.equal(
    (await one("SELECT status FROM applications WHERE id='due'"))!.status,
    "queued",
  );
  await processReviewDeadlines(time);
  const approved = await one("SELECT * FROM applications WHERE id='due'");
  assert.equal(approved!.approval_method, "automatic");
  assert.equal(await readUpload("due.pdf"), null);
  await processReviewDeadlines(time + 1000);
  assert.equal(
    (await one("SELECT decided_at FROM applications WHERE id='due'"))!
      .decided_at,
    approved!.decided_at,
  );
  assert.equal(await nextMaintenanceTime(), null);
});

test("PayPal webhook: rejects forged signatures/amounts, verifies stored order, accepts retries once", async () => {
  const appId = "webhook-application",
    orderId = "SYNTHETICORDER",
    captureId = "SYNTHETICCAPTURE";
  await run(
    "INSERT INTO applications(id,user_id,kind,data_json,status,paid,paypal_order,created_at) VALUES(?,?,?,?,?,?,?,?)",
    appId,
    "demo_donor2",
    "update",
    JSON.stringify(emptyProfile()),
    "payment_pending",
    0,
    orderId,
    new Date().toISOString(),
  );
  Object.assign(process.env, {
    PAYMENT_MODE: "paypal",
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "synthetic-id",
    PAYPAL_CLIENT_SECRET: "synthetic-secret",
    PAYPAL_WEBHOOK_ID: "synthetic-webhook",
  });
  const savedFetch = globalThis.fetch;
  let authentic = false,
    amount = "5000",
    verifications = 0,
    reads = 0,
    captures = 0,
    orderState = "COMPLETED";
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api-m.sandbox.paypal.com/"))
      return savedFetch(input, init);
    if (url.endsWith("/v1/oauth2/token"))
      return Response.json({
        access_token: "synthetic-access",
        expires_in: 3600,
      });
    if (url.endsWith("/verify-webhook-signature")) {
      verifications++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.webhook_id, "synthetic-webhook");
      assert.equal(body.transmission_id, "synthetic-transmission");
      return Response.json({
        verification_status: authentic ? "SUCCESS" : "FAILURE",
      });
    }
    if (url.endsWith("/v2/checkout/orders/" + orderId + "/capture")) {
      assert.equal(init?.method, "POST");
      assert.equal(orderState, "APPROVED");
      captures++;
      orderState = "COMPLETED";
    } else {
      assert.ok(url.endsWith("/v2/checkout/orders/" + orderId));
    }
    reads++;
    return Response.json({
      status: orderState,
      purchase_units: [
        {
          custom_id: appId,
          amount: { currency_code: "JPY", value: amount },
          payments: {
            captures: [
              {
                id: captureId,
                status: "COMPLETED",
                amount: { currency_code: "JPY", value: amount },
              },
            ],
          },
        },
      ],
    });
  };
  const event: any = {
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: captureId,
      supplementary_data: { related_ids: { order_id: orderId } },
    },
  };
  const webhook = () =>
    handle(
      new Request("http://localhost:3000/api/payments/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-auth-algo": "SHA256withRSA",
          "paypal-cert-url": "https://api.sandbox.paypal.com/synthetic-cert",
          "paypal-transmission-id": "synthetic-transmission",
          "paypal-transmission-sig": "synthetic-signature",
          "paypal-transmission-time": new Date().toISOString(),
        },
        body: JSON.stringify(event),
      }),
      ["payments", "webhook"],
    );
  try {
    assert.equal((await webhook()).status, 401);
    assert.equal(
      (await one("SELECT paid FROM applications WHERE id=?", appId))!.paid,
      0,
    );
    assert.equal(reads, 0);
    authentic = true;
    amount = "4999";
    assert.equal((await webhook()).status, 409);
    assert.equal(
      (await one("SELECT paid FROM applications WHERE id=?", appId))!.paid,
      0,
    );
    amount = "5000";
    assert.equal((await webhook()).status, 200);
    const paid = await one(
      "SELECT paid_at,payment_ref FROM applications WHERE id=?",
      appId,
    );
    assert.equal(paid!.payment_ref, captureId);
    assert.equal((await webhook()).status, 200);
    assert.equal(
      (await one("SELECT paid_at FROM applications WHERE id=?", appId))!
        .paid_at,
      paid!.paid_at,
    );
    assert.equal(
      Number(
        (await one(
          "SELECT COUNT(*) AS n FROM review_mail WHERE application_id=?",
          appId,
        ))!.n,
      ),
      1,
    );
    assert.equal(verifications, 4);

    // An approved-order webhook completes payment even if the browser never returns.
    await run(
      "UPDATE applications SET paid=0,status='payment_pending',payment_ref=NULL,paid_at=NULL WHERE id=?",
      appId,
    );
    await run("DELETE FROM review_mail WHERE application_id=?", appId);
    event.event_type = "CHECKOUT.ORDER.APPROVED";
    event.resource = { id: orderId };
    orderState = "CREATED";
    assert.equal((await webhook()).status, 409);
    assert.equal(captures, 0);
    orderState = "APPROVED";
    amount = "4999";
    assert.equal((await webhook()).status, 409);
    assert.equal(captures, 0);
    amount = "5000.00";
    assert.equal((await webhook()).status, 200);
    assert.equal(captures, 1);
    assert.equal(
      (await one("SELECT paid FROM applications WHERE id=?", appId))!.paid,
      1,
    );
    assert.equal((await webhook()).status, 200);
    assert.equal(captures, 1);
    assert.equal(
      Number(
        (await one(
          "SELECT COUNT(*) n FROM review_mail WHERE application_id=?",
          appId,
        ))!.n,
      ),
      1,
    );
  } finally {
    globalThis.fetch = savedFetch;
    process.env.PAYMENT_MODE = "demo";
    for (const key of [
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
      "PAYPAL_WEBHOOK_ID",
    ])
      delete process.env[key];
  }
});

