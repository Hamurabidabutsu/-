import { runWorkflow } from "./helpers/workflow-scenario";
import { runAdminEntry } from "./helpers/admin-entry-scenario";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import { verifiedCapture } from "../src/lib/server";
import { emptyProfile, validDate, ageOf, ageAt } from "../src/lib/shared";

const directory = mkdtempSync(path.join(tmpdir(), "kounotori-test-"));
const port = 3217,
  origin = `http://localhost:${port}`;
let child: ReturnType<typeof spawn>,
  output = "";
before(async () => {
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", String(port)],
    {
      env: {
        ...process.env,
        APP_MODE: "demo",
        PAYMENT_MODE: "demo",
        MAIL_MODE: "preview",
        SMTP_HOST: "",
        MAIL_FROM: "",
        DATA_DIR: directory,
        SITE_URL: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (b) => (output += b));
  child.stderr?.on("data", (b) => (output += b));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Test server did not start: " + output);
});
async function stop(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}
after(async () => {
  if (child) await stop(child);
  rmSync(directory, { recursive: true, force: true });
});
async function call(
  route: string,
  method = "GET",
  data?: unknown,
  cookie = "",
  expected = 200,
) {
  const response = await fetch(origin + "/api/" + route, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return {
    ...result,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie,
  };
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP48OEDAAWkAtEPcc/YAAAAAElFTkSuQmCC",
  "base64",
);
async function upload(kind: string, cookie: string, conversationId = "") {
  const f = new FormData();
  f.set("kind", kind);
  f.set("file", new Blob([png], { type: "image/png" }), "synthetic.png");
  if (conversationId) f.set("conversationId", conversationId);
  const r = await fetch(origin + "/api/files", {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie },
    body: f,
  });
  const b = await r.json();
  assert.equal(r.status, 201, JSON.stringify(b));
  return b.file.id as string;
}
async function fileStatus(id: string, cookie = "") {
  return (
    await fetch(origin + "/api/files/" + id, {
      headers: cookie ? { Cookie: cookie } : {},
    })
  ).status;
}
const signup = (
  email: string,
  role: string,
  birthDate = "1990-01-01",
  expected = 200,
) =>
  call(
    "auth/signup",
    "POST",
    {
      email,
      password: "Test-only-password-123!",
      birthDate,
      role,
      agreed: true,
    },
    "",
    expected,
  );

test("SQLite: reusable free administrator donor entry preserves access controls", async () => {
  await runAdminEntry(call);
});

test("決済の額・通貨・申請ID・完了状態をサーバーで照合する", () => {
  const order = {
    status: "COMPLETED",
    purchase_units: [
      {
        custom_id: "app-1",
        payments: {
          captures: [
            {
              id: "capture-1",
              status: "COMPLETED",
              amount: { currency_code: "JPY", value: "5000" },
            },
          ],
        },
      },
    ],
  };
  assert.equal(verifiedCapture(order, "app-1"), "capture-1");
  for (const invalid of [
    { ...order, status: "APPROVED" },
    { ...order, purchase_units: [] },
    {
      ...order,
      purchase_units: [{ ...order.purchase_units[0], custom_id: "app-2" }],
    },
    {
      ...order,
      purchase_units: [
        {
          ...order.purchase_units[0],
          payments: {
            captures: [
              {
                id: "fake",
                status: "COMPLETED",
                amount: { currency_code: "JPY", value: "1" },
              },
            ],
          },
        },
      ],
    },
    {
      ...order,
      purchase_units: [
        {
          ...order.purchase_units[0],
          payments: {
            captures: [
              {
                id: "fake",
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "5000" },
              },
            ],
          },
        },
      ],
    },
  ])
    assert.throws(() => verifiedCapture(invalid, "app-1"));
});
test("日付の実在と年齢を確認する", () => {
  assert.equal(validDate("2025-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.ok(ageOf("1990-01-01") >= 18);
});
test("18歳未満・管理者への自己登録・別オリジンの操作を拒否する", async () => {
  await signup("minor@example.test", "recipient", "2015-01-01", 400);
  await signup("admin-fake@example.test", "admin", "1990-01-01", 400);
  const r = await fetch(origin + "/api/auth/demo", {
    method: "POST",
    headers: {
      Origin: "https://unrelated.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(r.status, 403);
  await call("admin/applications", "GET", undefined, "", 401);
});
test("liveモードではデモログイン・架空の提供者を利用できない", async () => {
  const liveDirectory = mkdtempSync(
      path.join(tmpdir(), "kounotori-live-test-"),
    ),
    liveOrigin = "http://localhost:3218";
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3218"],
    {
      env: {
        ...process.env,
        APP_MODE: "live",
        PAYMENT_MODE: "paypal",
        PAYPAL_CLIENT_ID: "",
        PAYPAL_CLIENT_SECRET: "",
        ADMIN_EMAIL: "",
        ADMIN_PASSWORD: "",
        DATA_DIR: liveDirectory,
        SITE_URL: liveOrigin,
      },
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(liveOrigin + "/api/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(ready, true);
    const health = await (await fetch(liveOrigin + "/api/health")).json();
    assert.equal(health.mode, "live");
    assert.equal(health.paypalConfigured, false);
    const denied = await fetch(liveOrigin + "/api/auth/demo", {
      method: "POST",
      headers: { Origin: liveOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    assert.equal(denied.status, 404);
    assert.equal(
      (await (await fetch(liveOrigin + "/api/donors")).json()).donors.length,
      0,
    );
  } finally {
    await stop(server);
    rmSync(liveDirectory, { recursive: true, force: true });
  }
});
test("登録・一括課金・審査・開示と撤回・画像チャット・実績確認・退会削除", async () => {
  await runWorkflow({
    call,
    signup,
    upload,
    fileStatus,
    assertEmpty: async () => {
      assert.equal(readdirSync(path.join(directory, "uploads")).length, 0);
    },
  });
});

