import nodemailer from "nodemailer";

export function mailMode() {
  if (process.env.MAIL_MODE === "preview" && process.env.APP_MODE === "demo")
    return "preview";
  if (process.env.SMTP_HOST && process.env.MAIL_FROM) return "smtp";
  return "unconfigured";
}

export async function deliverMail(to: string, subject: string, text: string) {
  if (mailMode() !== "smtp") throw new Error("SMTP未設定");
  return sendSmtpMail(to, subject, text);
}

export async function sendTestMail(to: string) {
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM)
    throw new Error("SMTP未設定");
  return sendSmtpMail(
    to,
    "コウノトリのつばさ：メール送信テスト",
    "サイトからのテストメールです。このメールが届けば、送信設定は動作しています。会員情報や書類は含まれていません。",
  );
}

async function sendSmtpMail(to: string, subject: string, text: string) {
  const host = process.env.SMTP_HOST!,
    port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SMTPポートを確認してください");
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: !local && port !== 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 5000,
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      transport.sendMail({
        from: process.env.MAIL_FROM!,
        to,
        subject,
        text,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("SMTP timeout")), 8000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    transport.close();
  }
}

