import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import { verifiedCapture } from "../src/lib/server";
import { emptyProfile, validDate, ageOf } from "../src/lib/shared";

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
after(() => {
  child?.kill();
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
    server.kill();
    rmSync(liveDirectory, { recursive: true, force: true });
  }
});
test("登録・一括課金・審査・開示と撤回・画像チャット・実績確認・退会削除", async () => {
  const d = await signup("synthetic-donor@example.test", "donor"),
    r = await signup("synthetic-recipient@example.test", "recipient"),
    outsider = await signup("outsider@example.test", "recipient");
  const admin = await call("auth/demo", "POST", { role: "admin" });
  const profile = emptyProfile();
  Object.assign(profile, {
    bodyDate: "2026-10-01",
    weekdays: ["土", "祝"],
    normalRegions: [{ prefecture: "東京都", area: "全域" }],
    travelRegions: [{ prefecture: "東京都", area: "全域" }],
    academics: [
      {
        kind: "highschool",
        catalogId: "",
        school: "テスト高校",
        faculty: "",
        department: "普通科",
        iq: null,
      },
    ],
    semenDate: "2026-10-01",
    semen: { volume: 3, motility: 65 },
  });
  await call("applications", "POST", { profile, fileIds: [] }, d.cookie, 400);
  await call(
    "profile",
    "PATCH",
    { profile: { ...profile, academics: [] } },
    d.cookie,
    400,
  );
  const docs = [];
  for (const kind of ["identity", "body", "highschool", "semen"])
    docs.push(await upload(kind, d.cookie));
  const photo = await upload("photo", d.cookie);
  assert.equal(await fileStatus(photo), 401);
  assert.equal(await fileStatus(photo, r.cookie), 404);
  const cancelled = await call(
    "applications",
    "POST",
    { profile, fileIds: docs },
    d.cookie,
    201,
  );
  await call(
    "applications/" + cancelled.applicationId,
    "DELETE",
    undefined,
    d.cookie,
  );
  const app = await call(
    "applications",
    "POST",
    { profile, fileIds: docs },
    d.cookie,
    201,
  );
  await call(
    "admin/applications/" + app.applicationId,
    "PATCH",
    { action: "start" },
    admin.cookie,
    409,
  );
  await call("payments/" + app.applicationId + "/demo", "POST", {}, d.cookie);
  await call(
    "admin/applications/" + app.applicationId,
    "PATCH",
    { action: "start" },
    admin.cookie,
  );
  await call(
    "admin/applications/" + app.applicationId,
    "PATCH",
    {
      action: "approve",
      confirmed: true,
      academicDeviations: { highschool: 70 },
    },
    admin.cookie,
  );
  for (const doc of docs)
    assert.equal(await fileStatus(doc, admin.cookie), 404);
  let published = (await call("donors/" + d.user.id)).donor;
  assert.equal(published.iq, 130);
  assert.equal(published.privateInfo, undefined);
  assert.equal(published.birthDate, undefined);
  assert.equal(published.email, undefined);
  assert.equal(published.academics, undefined);
  // Unchanged manually verified academic reference must survive free availability edits.
  await call(
    "profile",
    "PATCH",
    { profile: { ...profile, frequency: 2 }, publish: true },
    d.cookie,
  );
  assert.equal((await call("donors/" + d.user.id)).donor.iq, 130);
  const updated = {
    ...profile,
    frequency: 2,
    bodyDate: "2026-10-02",
    weight: 66,
  };
  const bodyDoc = await upload("body", d.cookie);
  const update = await call(
    "applications",
    "POST",
    { profile: updated, fileIds: [bodyDoc] },
    d.cookie,
    201,
  );
  assert.equal(update.amount, 5000);
  await call(
    "payments/" + update.applicationId + "/demo",
    "POST",
    {},
    d.cookie,
  );
  await call(
    "admin/applications/" + update.applicationId,
    "PATCH",
    { action: "start" },
    admin.cookie,
  );
  await call(
    "admin/applications/" + update.applicationId,
    "PATCH",
    { action: "revise", reason: "書類が不鮮明" },
    admin.cookie,
  );
  const revised = await call(
    "applications/" + update.applicationId + "/revise",
    "POST",
    { profile: updated, fileIds: [] },
    d.cookie,
  );
  assert.equal(revised.additionalCharge, 0);
  await call(
    "admin/applications/" + update.applicationId,
    "PATCH",
    { action: "start" },
    admin.cookie,
  );
  await call(
    "admin/applications/" + update.applicationId,
    "PATCH",
    { action: "approve", confirmed: true },
    admin.cookie,
  );
  await call(
    "admin/donors/" + d.user.id,
    "PATCH",
    { paused: true },
    admin.cookie,
  );
  await call("profile/availability", "POST", { paused: false }, d.cookie, 409);
  await call("donors/" + d.user.id, "GET", undefined, "", 404);
  await call(
    "admin/donors/" + d.user.id,
    "PATCH",
    { paused: false },
    admin.cookie,
  );
  const chat = await call(
      "conversations",
      "POST",
      { donorId: d.user.id },
      r.cookie,
      201,
    ),
    cid = chat.conversationId;
  await call(
    "conversations/" + cid + "/messages",
    "POST",
    { body: "承認前" },
    r.cookie,
    403,
  );
  await call("conversations/" + cid, "GET", undefined, outsider.cookie, 404);
  await call("conversations/" + cid, "PATCH", { action: "accept" }, d.cookie);
  await call(
    "conversations/" + cid + "/messages",
    "POST",
    { body: "合成データでチャットを確認" },
    r.cookie,
    201,
  );
  const image = await upload("chat", r.cookie, cid);
  await call(
    "conversations/" + cid + "/messages",
    "POST",
    { body: "", fileId: image },
    r.cookie,
    201,
  );
  assert.equal(await fileStatus(image, outsider.cookie), 404);
  await call(
    "conversations/" + cid,
    "PATCH",
    { action: "disclose", enabled: true },
    d.cookie,
  );
  assert.equal(
    (await call("donors/" + d.user.id, "GET", undefined, r.cookie)).donor
      .privateInfo.academics[0].school,
    "テスト高校",
  );
  assert.equal(await fileStatus(photo, r.cookie), 200);
  await call(
    "conversations/" + cid,
    "PATCH",
    { action: "disclose", enabled: false },
    d.cookie,
  );
  assert.equal(
    (await call("donors/" + d.user.id, "GET", undefined, r.cookie)).donor
      .privateInfo,
    undefined,
  );
  assert.equal(await fileStatus(photo, r.cookie), 404);
  await call(
    "conversations/" + cid + "/events",
    "POST",
    { kind: "donation", date: "2026-10-01" },
    d.cookie,
    201,
  );
  let events = (await call("conversations/" + cid, "GET", undefined, r.cookie))
    .events;
  assert.equal((await call("donors/" + d.user.id)).donor.donationCount, 0);
  await call("events/" + events[0].id, "PATCH", { confirmed: true }, r.cookie);
  assert.equal((await call("donors/" + d.user.id)).donor.donationCount, 1);
  assert.equal(
    (await call("conversations/" + cid, "GET", undefined, admin.cookie))
      .messages.length,
    2,
  );
  await call(
    "conversations/" + cid + "/messages",
    "POST",
    { body: "管理者から送信" },
    admin.cookie,
    403,
  );
  const deleted = await call("account", "DELETE", { confirm: true }, d.cookie);
  assert.equal(deleted.pendingFileCleanup, 0);
  assert.equal(await fileStatus(image, r.cookie), 404);
  assert.equal(await fileStatus(photo, r.cookie), 404);
  await call("conversations/" + cid, "GET", undefined, r.cookie, 404);
  await call("donors/" + d.user.id, "GET", undefined, "", 404);
  const remaining = (await call("conversations", "GET", undefined, r.cookie))
    .conversations;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].status, "deleted");
  assert.equal(remaining[0].donor_id, undefined);
  assert.equal(readdirSync(path.join(directory, "uploads")).length, 0);
});
