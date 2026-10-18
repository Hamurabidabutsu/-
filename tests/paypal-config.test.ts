import { test } from "node:test";
import assert from "node:assert/strict";
import { paypalConfiguration } from "../src/lib/paypal-config";

test("Staging Live credentials preserves Sandbox and refuses real payments in demo", () => {
  const env = {
    APP_MODE: "demo",
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "sandbox-id",
    PAYPAL_CLIENT_SECRET: "sandbox-secret",
    PAYPAL_WEBHOOK_ID: "sandbox-hook",
    PAYPAL_LIVE_CLIENT_ID: "live-id",
    PAYPAL_LIVE_CLIENT_SECRET: "live-secret",
    PAYPAL_LIVE_WEBHOOK_ID: "live-hook",
  };
  assert.equal(paypalConfiguration(env).clientId, "sandbox-id");
  assert.equal(paypalConfiguration(env).webhookId, "sandbox-hook");
  assert.equal(
    paypalConfiguration({ ...env, PAYPAL_ENVIRONMENT: "live" }).allowed,
    false,
  );
  const live = paypalConfiguration({
    ...env,
    APP_MODE: "live",
    PAYPAL_ENVIRONMENT: "live",
  });
  assert.equal(live.allowed, true);
  assert.equal(live.clientId, "live-id");
  assert.equal(live.webhookId, "live-hook");
  assert.equal(
    paypalConfiguration({
      PAYPAL_ENVIRONMENT: "live",
      PAYPAL_CLIENT_ID: "sandbox-id",
    }).clientId,
    undefined,
  );
});

