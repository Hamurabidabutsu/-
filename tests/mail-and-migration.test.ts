import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, Socket } from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { emptyProfile } from "../src/lib/shared";

async function serverAt(
  directory: string,
  port: number,
  extra: Record<string, string> = {},
) {
  const origin = `http://127.0.0.1:${port}`,
    child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        env: {
          ...process.env,
          APP_MODE: "demo",
          PAYMENT_MODE: "demo",
          DATA_DIR: directory,
          SITE_URL: origin,
          MAIL_MODE: "preview",
          SMTP_HOST: "",
          MAIL_FROM: "",
          ...extra,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if (
        (
          await fetch(origin + "/api/health", {
            signal: AbortSignal.timeout(500),
          })
        ).ok
      )
        return { origin, child };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error("test server failed to start: " + output);
}
async function stop(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}
async function call(
  origin: string,
  route: string,
  method = "GET",
  data?: unknown,
  cookie = "",
  status = 200,
) {
  const r = await fetch(origin + "/api/" + route, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return { ...b, cookie: r.headers.get("set-cookie")?.split(";")[0] || cookie };
}
const signup = (origin: string, email: string) =>
  call(origin, "auth/signup", "POST", {
    email,
    password: "Synthetic-password-123",
    role: "recipient",
    birthDate: "1990-01-01",
    agreed: true,
  });
async function eventually(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail("timed out waiting for SMTP mail");
}

test("SMTP経由の確認・通知、未確認宛て/通知オフの抑止、本文非開示、送信障害時の会話保存", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "kounotori-mail-"));
  const received: { to: string; data: string }[] = [],
    sockets = new Set<Socket>();
  const smtp = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.write("220 synthetic SMTP\r\n");
    let buffer = "",
      dataMode = false,
      mail = "",
      recipient = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const i = buffer.indexOf("\r\n"),
          line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (dataMode) {
          if (line === ".") {
            const body = mail.split("\r\n\r\n").slice(1).join("\r\n");
            const decoded = /Content-Transfer-Encoding: base64/i.test(mail)
              ? Buffer.from(body, "base64").toString()
              : body
                  .replace(/=\r\n/g, "")
                  .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
                    String.fromCharCode(parseInt(hex, 16)),
                  );
            received.push({ to: recipient, data: decoded });
            dataMode = false;
            socket.write("250 stored\r\n");
          } else mail += line + "\r\n";
          continue;
        }
        if (/^EHLO|^HELO/.test(line))
          socket.write("250-localhost\r\n250 8BITMIME\r\n");
        else if (/^MAIL FROM/.test(line)) socket.write("250 OK\r\n");
        else if (/^RCPT TO/.test(line)) {
          recipient = line
            .slice(line.indexOf(":") + 1)
            .trim()
            .replace(/[<>]/g, "");
          socket.write("250 OK\r\n");
        } else if (line === "DATA") {
          dataMode = true;
          mail = "";
          socket.write("354 send data\r\n");
        } else if (line === "QUIT") {
          socket.end("221 bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const smtpPort = (smtp.address() as { port: number }).port;
  const { origin, child } = await serverAt(directory, 3220, {
    MAIL_MODE: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtpPort),
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    MAIL_FROM: "site@example.test",
    REVIEW_EMAIL: "review@example.test",
  });
  try {
    const r = await signup(origin, "verified@example.test");
    await eventually(() =>
      received.some((m) => m.to === "verified@example.test"),
    );
    const token = received
      .find((m) => m.to === "verified@example.test")!
      .data.match(/token=([a-f0-9]{64})/)?.[1];
    assert.ok(token);
    await call(origin, "auth/verify-email", "POST", { token });
    await call(origin, "auth/verify-email", "POST", { token }, "", 400);
    assert.equal(
      (await call(origin, "me", "GET", undefined, r.cookie)).user.emailVerified,
      true,
    );
    const donor = await call(origin, "auth/demo", "POST", { role: "donor" });
    const paymentDb = new DatabaseSync(path.join(directory, "site.sqlite"));
    try {
      paymentDb
        .prepare(
          "INSERT INTO applications(id,user_id,kind,data_json,status,paid,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          "smtp-review",
          "demo_donor1",
          "update",
          JSON.stringify(emptyProfile()),
          "payment_pending",
          0,
          new Date().toISOString(),
        );
      await call(origin, "payments/smtp-review/demo", "POST", {}, donor.cookie);
      await eventually(() =>
        received.some((m) => m.to === "review@example.test"),
      );
      await eventually(
        () =>
          paymentDb
            .prepare(
              "SELECT status FROM review_mail WHERE application_id='smtp-review'",
            )
            .get()?.status === "sent",
      );
      await call(origin, "payments/smtp-review/demo", "POST", {}, donor.cookie);
      assert.equal(
        received.filter((m) => m.to === "review@example.test").length,
        1,
      );
    } finally {
      paymentDb.close();
    }
    const c = await call(
      origin,
      "conversations",
      "POST",
      { donorId: "demo_donor1" },
      r.cookie,
      201,
    );
    await call(
      origin,
      "conversations/" + c.conversationId,
      "PATCH",
      { action: "accept" },
      donor.cookie,
    );
    await eventually(
      () =>
        received.filter((m) => m.to === "verified@example.test").length === 2,
    );
    await call(
      origin,
      "conversations/" + c.conversationId + "/messages",
      "POST",
      { body: "DO_NOT_INCLUDE_PRIVATE_CHAT" },
      donor.cookie,
      201,
    );
    await eventually(
      () =>
        received.filter((m) => m.to === "verified@example.test").length === 3,
    );
    assert.ok(
      received.every((m) => !m.data.includes("DO_NOT_INCLUDE_PRIVATE_CHAT")),
    );
    await call(
      origin,
      "account/settings",
      "PATCH",
      { emailNotifications: false },
      r.cookie,
    );
    await call(
      origin,
      "conversations/" + c.conversationId + "/messages",
      "POST",
      { body: "notification off" },
      donor.cookie,
      201,
    );
    const unverified = await signup(origin, "unverified@example.test");
    await eventually(() =>
      received.some((m) => m.to === "unverified@example.test"),
    );
    const other = await call(
      origin,
      "conversations",
      "POST",
      { donorId: "demo_donor1" },
      unverified.cookie,
      201,
    );
    await call(
      origin,
      "conversations/" + other.conversationId,
      "PATCH",
      { action: "accept" },
      donor.cookie,
    );
    await call(
      origin,
      "conversations/" + other.conversationId + "/messages",
      "POST",
      { body: "unverified" },
      donor.cookie,
      201,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      received.filter((m) => m.to === "unverified@example.test").length,
      1,
    );
    assert.equal(
      received.filter((m) => m.to === "verified@example.test").length,
      3,
    );
    await call(origin, "account/mail-preview", "GET", undefined, r.cookie, 404);
    await call(
      origin,
      "account/settings",
      "PATCH",
      { emailNotifications: true },
      r.cookie,
    );
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
    await call(
      origin,
      "conversations/" + c.conversationId + "/messages",
      "POST",
      { body: "保存されるメッセージ" },
      donor.cookie,
      201,
    );
    const chat = await call(
      origin,
      "conversations/" + c.conversationId,
      "GET",
      undefined,
      r.cookie,
    );
    assert.ok(
      chat.messages.some((m: any) => m.body === "保存されるメッセージ"),
    );
    await call(origin, "account", "DELETE", { confirm: true }, r.cookie);
    await stop(child);
    const db = new DatabaseSync(path.join(directory, "site.sqlite"));
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM mail_queue WHERE user_id=? OR conversation_id=?",
        )
        .get(r.user.id, c.conversationId)!.n,
      0,
    );
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM email_tokens WHERE user_id=?")
        .get(r.user.id)!.n,
      0,
    );
    db.close();
  } finally {
    await stop(child);
    for (const socket of sockets) socket.destroy();
    if (smtp.listening)
      await new Promise<void>((resolve) => smtp.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("旧DBを移行して血圧を除き、一般筋肉量から率を捏造せず、再起動しても本人の情報を維持", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "kounotori-migration-"));
  const db = new DatabaseSync(path.join(directory, "site.sqlite"));
  db.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,birth_date TEXT NOT NULL,display_id TEXT NOT NULL,created_at TEXT NOT NULL,last_active TEXT NOT NULL);CREATE TABLE profiles(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL,data_json TEXT NOT NULL,approved_json TEXT,verified INTEGER NOT NULL,photo_id TEXT);PRAGMA user_version=1;",
  );
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)").run(
    "legacy-donor",
    "legacy@example.test",
    "unused",
    "donor",
    "1990-01-01",
    "D-LEGACY",
    new Date().toISOString(),
    new Date().toISOString(),
  );
  const p = {
    ...emptyProfile(),
    muscle: 30,
    systolic: 118,
    diastolic: 76,
    healthDate: "2026-01-01",
    hereditary: "あり",
    familyHistory: undefined,
    history: "本人の記載",
    hair: "黒",
    weekdays: ["土"],
  };
  db.prepare("INSERT INTO profiles VALUES(?,?,?,?,?,NULL)").run(
    "legacy-donor",
    "approved",
    JSON.stringify(p),
    JSON.stringify(p),
    1,
  );
  db.close();
  let server = await serverAt(directory, 3221);
  try {
    const d = (await call(server.origin, "donors/legacy-donor")).donor;
    assert.equal(d.skeletalRate, null);
    assert.equal(d.skeletalMass, null);
    assert.equal(d.visionLeft, null);
    assert.equal(d.hair, "黒");
    assert.equal(d.familyHistory, "");
    assert.ok(d.history.includes("本人の記載"));
    assert.ok(d.history.includes("旧形式の遺伝性疾患申告：あり"));
    for (const k of [
      "muscle",
      "systolic",
      "diastolic",
      "healthDate",
      "hereditary",
      "email",
    ])
      assert.equal(k in d, false);
    await stop(server.child);
    server = await serverAt(directory, 3221);
    assert.equal(
      (await call(server.origin, "donors/legacy-donor")).donor.history,
      d.history,
    );
    const migrated = new DatabaseSync(path.join(directory, "site.sqlite"));
    assert.equal(
      migrated.prepare("PRAGMA user_version").get()!.user_version,
      5,
    );
    migrated.close();
  } finally {
    await stop(server.child);
    rmSync(directory, { recursive: true, force: true });
  }
});
