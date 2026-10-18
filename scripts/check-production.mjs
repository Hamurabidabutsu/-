const required = [
  "SITE_URL",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "REVIEW_EMAIL",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "MAIL_FROM",
  "OPERATOR_NAME",
  "OPERATOR_ADDRESS",
  "OPERATOR_PHONE",
];
const missing = required.filter((key) => !process.env[key]?.trim());
const problems = [];
if ((process.env.ADMIN_PASSWORD || "").length < 12)
  problems.push("12文字以上の管理者パスワード（ADMIN_PASSWORD）");
if (
  process.env.OPERATOR_TYPE === "company" &&
  !process.env.OPERATOR_REPRESENTATIVE?.trim()
)
  problems.push("法人の運営責任者（OPERATOR_REPRESENTATIVE）");
if (
  process.env.OPERATOR_DISPLAY_MODE !== "public" &&
  process.env.OPERATOR_DISCLOSURE_READY !== "yes"
)
  problems.push(
    "請求者へ書面または電子メール等で遅滞なく開示できる体制（OPERATOR_DISCLOSURE_READY=yes）",
  );
if (process.env.APP_MODE !== "live") problems.push("APP_MODE=live");
if (process.env.PAYMENT_MODE !== "paypal") problems.push("PAYMENT_MODE=paypal");
if (process.env.PAYPAL_ENVIRONMENT !== "live")
  problems.push("PAYPAL_ENVIRONMENT=live（Sandboxでの外部検証後に切り替え）");
if (process.env.MAIL_MODE !== "smtp") problems.push("MAIL_MODE=smtp");
try {
  const url = new URL(process.env.SITE_URL || "");
  if (url.protocol !== "https:" || url.hostname === "localhost")
    problems.push("公開用HTTPSのSITE_URL");
} catch {
  problems.push("公開用HTTPSのSITE_URL");
}
if (missing.length || problems.length) {
  console.error("本番設定は未完了です。値そのものは表示しません。");
  for (const key of missing) console.error("未設定: " + key);
  for (const item of problems) console.error("確認: " + item);
  process.exitCode = 1;
} else
  console.log(
    "必須設定の形式を確認しました。外部決済・メール到達・公開先での実動作と、運営者情報の正確性は別途確認が必要です。",
  );

