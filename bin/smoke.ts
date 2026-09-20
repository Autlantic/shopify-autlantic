import {
  signBillingWebhookBody,
  verifyBillingWebhookDetailed,
} from "@autlantic/payments-recurring";

const secret = "whsec_test";
const body = JSON.stringify({
  id: "evt_smoke",
  type: "payment.paid",
  data: { payment: { id: "pay_smoke", metadata: { shopify_payment_gid: "gid://smoke" } } },
});
const sig = signBillingWebhookBody(secret, body);
const ok = verifyBillingWebhookDetailed(secret, body, sig);
if (!ok.ok) {
  console.error("smoke failed", ok);
  process.exit(1);
}
const bad = verifyBillingWebhookDetailed(secret, body, "t=1,v1=deadbeef");
if (bad.ok) {
  console.error("smoke failed: bad signature accepted");
  process.exit(1);
}
console.log("smoke ok");
