import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(tmpdir(), "kounotori-support-"));
const origin = "http://127.0.0.1:3224";
let child: ReturnType<typeof spawn>,
  output = "";
before(async () => {
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3224",
    ],
    {
      env: {
        ...process.env,
        APP_MODE: "demo",
        PAYMENT_MODE: "demo",
        MAIL_MODE: "preview",
        SMTP_HOST: "",
        DATA_DIR: directory,
        SITE_URL: origin,
        OPERATOR_NAME: "PRIVATE_TEST_OPERATOR",
        OPERATOR_TYPE: "company",
        OPERATOR_REPRESENTATIVE: "PRIVATE_TEST_REPRESENTATIVE",
        OPERATOR_ADDRESS: "PRIVATE_TEST_ADDRESS",
        OPERATOR_PHONE: "PRIVATE_TEST_PHONE",
        OPERATOR_DISPLAY_MODE: "on_request",
        OPERATOR_DISCLOSURE_READY: "yes",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (b) => (output += b));
  child.stderr?.on("data", (b) => (output += b));
  for (let n = 0; n < 100; n++) {
    try {
      if (
        (
          await fetch(origin + "/api/health", {
            signal: AbortSignal.timeout(500),
          })
        ).ok
      )
        return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(output);
});
after(async () => {
  if (child && child.exitCode === null && child.signalCode === null)
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
  rmSync(directory, { recursive: true, force: true });
});
async function call(
  route: string,
  method = "GET",
  data?: unknown,
  cookie = "",
  token = "",
  expected = 200,
) {
  const response = await fetch(origin + "/api/" + route, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { "X-Support-Token": token } : {}),
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
const content = {
  category: "その他",
  subject: "合成データの問い合わせ",
  body: "テストの本文です。",
};
const login = (role: string) => call("auth/demo", "POST", { role });
test("請求時開示モードでは公開APIに氏名・住所・電話番号を返さない", async () => {
  const result = await call("public-config");
  assert.equal(result.operator.mode, "on_request");
  assert.equal(result.operator.type, "company");
  assert.equal(result.operator.representative, "");
  assert.equal(result.operator.disclosureReady, true);
  assert.equal(result.operator.name, "");
  assert.equal(result.operator.address, "");
  assert.equal(result.operator.phone, "");
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TEST/);
});

test("会員問い合わせの権限・運営返信・対応完了・退会時の削除", async () => {
  const owner = await login("recipient"),
    outsider = await login("donor"),
    admin = await login("admin");
  await call("admin/support", "GET", undefined, owner.cookie, "", 403);
  const created = await call("support", "POST", content, owner.cookie, "", 201);
  assert.equal(created.accessToken, null);
  const route = "support/" + created.id;
  await call(route, "GET", undefined, "", "", 404);
  await call(route, "GET", undefined, outsider.cookie, "", 404);
  await call(route, "DELETE", undefined, outsider.cookie, "", 404);
  assert.ok(
    (await call("support", "GET", undefined, owner.cookie)).tickets.some(
      (t: any) => t.id === created.id,
    ),
  );
  const list = await call("admin/support", "GET", undefined, admin.cookie);
  assert.ok(list.tickets.some((t: any) => t.id === created.id));
  assert.equal("token_hash" in list.tickets[0], false);
  await call(route, "POST", { body: "運営からの回答" }, admin.cookie, "", 201);
  const thread = await call(route, "GET", undefined, owner.cookie);
  assert.equal(thread.ticket.status, "answered");
  assert.equal(thread.messages[1].sender, "admin");
  await call(route, "POST", { body: "追加の質問" }, owner.cookie, "", 201);
  assert.equal(
    (await call(route, "GET", undefined, admin.cookie)).ticket.status,
    "open",
  );
  await call(route, "PATCH", { status: "closed" }, owner.cookie);
  await call(route, "POST", { body: "完了後の追記" }, owner.cookie, "", 409);
  await call("account", "DELETE", { confirm: true }, owner.cookie);
  await call(route, "GET", undefined, admin.cookie, "", 404);
  const db = new DatabaseSync(path.join(directory, "site.sqlite"));
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM support_messages WHERE ticket_id=?")
      .get(created.id)!.n,
    0,
  );
  db.close();
});

test("未ログインの専用リンク・秘密トークンのハッシュ保存・入力制限・削除", async () => {
  const created = await call("support", "POST", content, "", "", 201);
  const route = "support/" + created.id;
  assert.ok(created.accessToken.length >= 40);
  await call(route, "GET", undefined, "", "incorrect", 404);
  await call("support", "GET", undefined, "", "", 401);
  const thread = await call(route, "GET", undefined, "", created.accessToken);
  assert.equal(thread.messages[0].body, content.body);
  assert.equal("token_hash" in thread.ticket, false);
  const db = new DatabaseSync(path.join(directory, "site.sqlite"));
  assert.notEqual(
    db
      .prepare("SELECT token_hash FROM support_tickets WHERE id=?")
      .get(created.id)!.token_hash,
    created.accessToken,
  );
  db.close();
  await call(route, "POST", { body: "追加連絡" }, "", created.accessToken, 201);
  await call(
    "support",
    "POST",
    { ...content, body: "x".repeat(4001) },
    "",
    "",
    400,
  );
  await call(
    "support",
    "POST",
    { ...content, category: "unknown" },
    "",
    "",
    400,
  );
  await call("support", "POST", { ...content, website: "bot" }, "", "", 400);
  await call(route, "DELETE", undefined, "", created.accessToken);
  await call(route, "GET", undefined, "", created.accessToken, 404);
});
