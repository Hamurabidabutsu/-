import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { emptyProfile } from "../src/lib/shared";
import { processReviewDeadlines, handle } from "../src/lib/server";

const directory = mkdtempSync(path.join(tmpdir(), "kounotori-review-"));
Object.assign(process.env, {
  DATA_DIR: directory,
  APP_MODE: "demo",
  PAYMENT_MODE: "demo",
  MAIL_MODE: "preview",
  SMTP_HOST: "",
  SITE_URL: "http://localhost:3223",
  REVIEW_EMAIL: "synthetic-review@example.test",
});
let database: DatabaseSync;
before(async () => {
  await processReviewDeadlines();
  database = new DatabaseSync(path.join(directory, "site.sqlite"));
  database.exec("PRAGMA foreign_keys=ON");
});
after(() => {
  database.close(); /* The application holds a connection until this test process exits. */
});
const base = Date.now();
const paidAt = new Date(base - 30 * 86400000).toISOString();
function application(
  name: string,
  status = "queued",
  profileStatus = "draft",
  paid = 1,
) {
  const profile = JSON.stringify(emptyProfile());
  database
    .prepare(
      "INSERT INTO users(id,email,password_hash,role,birth_date,display_id,created_at,last_active) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      name,
      name + "@example.test",
      "test",
      "donor",
      "1990-01-01",
      name,
      paidAt,
      paidAt,
    );
  database
    .prepare("INSERT INTO profiles(user_id,status,data_json) VALUES(?,?,?)")
    .run(name, profileStatus, profile);
  database
    .prepare(
      "INSERT INTO applications(id,user_id,kind,data_json,status,paid,created_at,paid_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      name,
      name,
      "initial",
      profile,
      status,
      paid,
      paidAt,
      paid ? paidAt : null,
    );
}
const app = (name: string) =>
  database.prepare("SELECT * FROM applications WHERE id=?").get(name)!;

test("30日境界、冪等性、未入金・差し戻し・不承認・休止・停止の除外、証明書削除", async () => {
  application("due");
  application("reviewing", "reviewing");
  for (const s of ["needs_changes", "rejected", "approved"]) application(s, s);
  application("paused", "queued", "paused");
  application("suspended", "queued", "suspended");
  application("unpaid", "payment_pending", "draft", 0);
  writeFileSync(
    path.join(directory, "uploads", "synthetic-document"),
    "synthetic",
  );
  database
    .prepare("INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)")
    .run(
      "doc",
      "due",
      "due",
      null,
      "identity",
      "synthetic-document",
      "image/png",
      "test.png",
      paidAt,
    );
  await processReviewDeadlines(base - 1);
  assert.equal(app("due").status, "queued");
  await processReviewDeadlines(base);
  assert.equal(app("due").status, "approved");
  assert.equal(app("reviewing").approval_method, "automatic");
  assert.equal(app("due").decided_at, new Date(base).toISOString());
  assert.equal(
    database.prepare("SELECT verified FROM profiles WHERE user_id='due'").get()!
      .verified,
    0,
  );
  assert.equal(
    existsSync(path.join(directory, "uploads", "synthetic-document")),
    false,
  );
  assert.equal(
    database
      .prepare("SELECT count(*) AS n FROM files WHERE application_id='due'")
      .get()!.n,
    0,
  );
  for (const s of [
    "needs_changes",
    "rejected",
    "approved",
    "paused",
    "suspended",
    "unpaid",
  ])
    assert.equal(app(s).approval_method, null);
  await processReviewDeadlines(base + 1000);
  assert.equal(app("due").decided_at, new Date(base).toISOString());
  application("withdrawn");
  database.prepare("DELETE FROM users WHERE id='withdrawn'").run();
  await processReviewDeadlines(base);
  assert.equal(
    database.prepare("SELECT id FROM applications WHERE id='withdrawn'").get(),
    undefined,
  );
});

test("入金確認時刻と審査メールを一度だけ保存し、通知は申請番号と管理リンクのみ", async () => {
  const login = await handle(
    new Request("http://localhost:3223/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "donor" }),
    }),
    ["auth", "demo"],
  );
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const data = JSON.stringify(emptyProfile());
  database
    .prepare(
      "INSERT INTO applications(id,user_id,kind,data_json,status,paid,created_at) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      "payment-test",
      "demo_donor1",
      "update",
      data,
      "payment_pending",
      0,
      new Date(base).toISOString(),
    );
  const request = () =>
    new Request("http://localhost:3223/api/payments/payment-test/demo", {
      method: "POST",
      headers: { Cookie: cookie },
    });
  assert.equal(
    (await handle(request(), ["payments", "payment-test", "demo"])).status,
    200,
  );
  const firstPaidAt = app("payment-test").paid_at;
  assert.ok(firstPaidAt);
  assert.equal(
    (await handle(request(), ["payments", "payment-test", "demo"])).status,
    200,
  );
  assert.equal(app("payment-test").paid_at, firstPaidAt);
  const mail = database
    .prepare("SELECT * FROM review_mail WHERE application_id='payment-test'")
    .get()!;
  assert.equal(mail.recipient, "synthetic-review@example.test");
  assert.equal(mail.status, "preview");
  assert.match(String(mail.body), /payment-test/);
  assert.match(String(mail.body), /http:\/\/localhost:3223\/admin/);
  assert.doesNotMatch(
    String(mail.body),
    /精液|生年月日|@example.test|attachment/,
  );
  assert.equal(
    database
      .prepare(
        "SELECT count(*) AS n FROM review_mail WHERE application_id='payment-test'",
      )
      .get()!.n,
    1,
  );
});

test("再起動後はHTTPアクセスなしで期限経過分を公開する", async () => {
  application("restart-due");
  database
    .prepare("UPDATE applications SET paid_at=? WHERE id='restart-due'")
    .run(new Date(Date.now() - 31 * 86400000).toISOString());
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3223",
    ],
    { env: { ...process.env }, stdio: "ignore" },
  );
  try {
    for (let n = 0; n < 100; n++) {
      if (app("restart-due").status === "approved") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(app("restart-due").approval_method, "automatic");
  } finally {
    if (child.exitCode === null)
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill();
      });
  }
});
