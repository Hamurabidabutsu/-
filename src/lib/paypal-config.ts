export function paypalConfiguration(env: Record<string, string | undefined> = process.env) {
  const live = env.PAYPAL_ENVIRONMENT === "live";
  return {
    baseURL: live
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com",
    allowed: !(live && env.APP_MODE === "demo"),
    clientId: live ? env.PAYPAL_LIVE_CLIENT_ID : env.PAYPAL_CLIENT_ID,
    clientSecret: live
      ? env.PAYPAL_LIVE_CLIENT_SECRET
      : env.PAYPAL_CLIENT_SECRET,
    webhookId: live ? env.PAYPAL_LIVE_WEBHOOK_ID : env.PAYPAL_WEBHOOK_ID,
  };
}

