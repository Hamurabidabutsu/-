import nodemailer from "nodemailer";

export function mailMode() {
  if (process.env.MAIL_MODE === "preview" && process.env.APP_MODE === "demo")
    return "preview";
  if (process.env.SMTP_HOST && process.env.MAIL_FROM) return "smtp";
  return "unconfigured";
}

export async function deliverMail(to: string, subject: string, text: string) {
  if (mailMode() !== "smtp") throw new Error("SMTP未設定");
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
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM!,
      to,
      subject,
      text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } finally {
    transport.close();
  }
}
