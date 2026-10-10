import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const noOpen = process.argv.includes("--no-open");
let server;
let stopping = false;

function childResult(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function freePort() {
  for (let port = 3000; port <= 3010; port++) {
    const available = await new Promise((resolve) => {
      const socket = createServer();
      socket.once("error", () => resolve(false));
      socket.listen(port, "127.0.0.1", () => socket.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error("3000〜3010番が使用中です。以前起動したデモを終了して、もう一度お試しください。");
}

function openBrowser(url) {
  let command, args;
  if (process.platform === "win32") {
    command = "cmd.exe";
    args = ["/d", "/c", "start", "", url];
  } else {
    command = process.platform === "darwin" ? "open" : "xdg-open";
    args = [url];
  }
  const browser = spawn(command, args, { stdio: "ignore" });
  browser.once("error", () => console.log("自動で開かない場合は、表示したアドレスをブラウザーに入力してください。"));
  browser.unref();
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 24) {
    throw new Error("Node.js 24以上をインストールしてください。https://nodejs.org/ja/download");
  }
  console.log("コウノトリのつばさ — ご自身のPCで試すデモ");
  const fingerprint = createHash("sha256").update(readFileSync(path.join(root, "package-lock.json"))).digest("hex");
  const marker = path.join(root, "node_modules", ".local-demo-lock");
  if (!existsSync(marker) || readFileSync(marker, "utf8") !== fingerprint || !existsSync(path.join(root, "node_modules", "next", "dist", "bin", "next"))) {
    console.log("初回の準備をしています。必要な部品をダウンロードするため、数分かかることがあります。");
    // Windowsのnpm.cmdにはシェルが必要。引数は固定値のみで、入力値やパスをコマンドへ挿入しない。
    const install = spawn("npm", ["ci", "--cache", ".npm-cache", "--no-fund"], {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (await childResult(install) !== 0) throw new Error("部品のインストールに失敗しました。インターネット接続を確認して再度起動してください。");
    writeFileSync(marker, fingerprint);
  }

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const environment = {
    ...process.env,
    APP_MODE: "demo",
    PAYMENT_MODE: "demo",
    MAIL_MODE: "preview",
    SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", MAIL_FROM: "",
    DATA_DIR: path.join(root, "data", "local-demo"),
    SITE_URL: url,
    PAYPAL_CLIENT_ID: "",
    PAYPAL_CLIENT_SECRET: "",
    ADMIN_EMAIL: "",
    ADMIN_PASSWORD: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    stdio: "inherit",
    env: environment,
  });
  const exited = childResult(server);
  let ended = false;
  exited.then(() => { ended = true; }, () => { ended = true; });
  let ready = false;
  for (let attempt = 0; attempt < 120 && !ended && !stopping; attempt++) {
    try {
      const response = await fetch(url + "/api/health", { signal: AbortSignal.timeout(1500) });
      const health = await response.json();
      if (response.ok && health.ok && health.mode === "demo" && health.paymentMode === "demo" && health.paypalConfigured === false) {
        ready = true;
        break;
      }
    } catch { /* 起動完了まで待つ。 */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) {
    server.kill();
    if (stopping) return;
    throw new Error("起動を完了できませんでした。上に表示されたエラーをご確認ください。");
  }
  console.log(`\n起動しました：${url}`);
  console.log("このウィンドウは開いたままにしてください。終了するには Ctrl+C を押します。");
  console.log("画面上部の「希望者で試す」「提供者で試す」「管理者で試す」で切り替えられます。\n");
  if (!noOpen) openBrowser(url);
  const code = await exited;
  if (!stopping && code !== 0) throw new Error("デモが終了しました。上に表示されたエラーをご確認ください。");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopping = true;
    server?.kill();
  });
}
main().catch((error) => {
  console.error("\n" + error.message);
  process.exitCode = 1;
});
