import { AutlanticBilling } from "@autlantic/payments-recurring";

export function createBilling(): AutlanticBilling {
  return AutlanticBilling.fromEnv();
}

export function payoutAddress(): string {
  return (process.env.AUTLANTIC_PAYOUT_ADDRESS_EVM ?? "").trim();
}

export function webhookSecret(): string {
  return (process.env.AUTLANTIC_BILLING_WEBHOOK_SECRET ?? "").trim();
}

export function appBaseUrl(): string {
  const url = (process.env.SHOPIFY_APP_URL ?? process.env.AUTLANTIC_SHOPIFY_APP_URL ?? "").trim();
  return url.replace(/\/$/, "");
}
