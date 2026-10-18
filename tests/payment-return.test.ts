import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentReturnApplication } from "../src/lib/payment-return";

test("PayPal return survives missing query parameters and respects cancellation", () => {
  assert.equal(
    paymentReturnApplication(
      new URLSearchParams("application=order-a&token=paypal-token"),
      null,
    ),
    "order-a",
  );
  assert.equal(
    paymentReturnApplication(new URLSearchParams(), "order-a"),
    "order-a",
  );
  assert.equal(paymentReturnApplication(new URLSearchParams(), null), null);
  assert.equal(
    paymentReturnApplication(
      new URLSearchParams("application=unrelated"),
      "order-a",
    ),
    null,
  );
  assert.equal(
    paymentReturnApplication(
      new URLSearchParams("cancelled=1&application=order-a&token=paypal-token"),
      "order-a",
    ),
    null,
  );
});

