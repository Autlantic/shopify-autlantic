# Autlantic Billing for Shopify

Offsite **USDC on Base** checkout via the hosted Autlantic Billing API.

Source of truth: `integrations/shopify` in [payments-sdk](https://github.com/Autlantic/payments-sdk). Uses [`@autlantic/payments-recurring`](../../packages/payments-recurring). App package: `@autlantic/shopify-billing` **1.0.0** (private workspace package; distribute via the GitHub mirror, not npm).

## Important: Shopify Payments Partner approval

Listing Autlantic at **Shopify Checkout** requires an **approved Shopify Payments Partner** app with an offsite payments extension. Ordinary Partner status is not enough.

Until approval:

- You can develop and review the Hono app + extension config in this repo
- Merchants **cannot** enable Autlantic on production checkouts
- `shopify app generate extension --type payments_extension` (and related CLI flows) may be unavailable

Apply / accept the Payments Partner invitation in the Partner Dashboard, complete the revenue-share agreement, then submit the app for payments review.

## Architecture

| Piece | Path / route |
|-------|----------------|
| App host | `src/index.ts` (Hono on Node) |
| Offsite extension | `extensions/autlantic-offsite/` |
| Payment session | `POST /payment` → Autlantic payment link → `{ redirect_url }` |
| Return / cancel | `GET /payment/return`, `GET /payment/cancel` |
| Autlantic webhook | `POST /webhooks/autlantic` → Shopify `paymentSessionResolve` |
| Refund session | `POST /refund` → rejects; one-time refunds are **manual** |
| Health / activity | `GET /health`, `GET /admin/activity` |

## What it does

1. Shopify starts an offsite payment session
2. App creates `POST /v1/payment-links` (`maxUses: 1`, metadata `shopify_payment_gid`)
3. Customer pays on hosted Autlantic checkout
4. `payment.paid` webhook resolves the Shopify payment session

Store currency must be **USD** or **USDC**. Payout address comes from `AUTLANTIC_PAYOUT_ADDRESS_EVM` (required for payment-link creation).

## Requirements

- Node **20+**
- Shopify Partner organization (and Payments Partner approval for production checkout)
- Hosted HTTPS app URL reachable by Shopify and by Autlantic webhooks
- Autlantic merchant portal API key and webhook endpoint secret
- Shop access token(s) so the app can call Payments Apps GraphQL mutations

## Configure

```bash
cp .env.example .env
# fill SHOPIFY_* and AUTLANTIC_* placeholders only — never commit .env
pnpm install
pnpm --filter @autlantic/shopify-billing smoke
pnpm --filter @autlantic/shopify-billing typecheck
pnpm --filter @autlantic/shopify-billing dev
```

| Variable | Purpose |
|----------|---------|
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Partner app credentials |
| `SHOPIFY_APP_URL` | Public HTTPS base (also used in `shopify.app.toml`) |
| `AUTLANTIC_BILLING_API_URL` | Default `https://billing.autlantic.com` |
| `AUTLANTIC_BILLING_API_KEY` | `abk_test_…` or `abk_live_…` |
| `AUTLANTIC_BILLING_WEBHOOK_SECRET` | Portal endpoint secret |
| `AUTLANTIC_PAYOUT_ADDRESS_EVM` | Merchant payout wallet (required) |
| `SHOPIFY_ACCESS_TOKEN` | Single-shop Admin/Payments token, **or** |
| `SHOPIFY_SHOP_TOKENS` | JSON map `{"store.myshopify.com":"shpat_…"}` |
| `PORT` | Default `3458` |

Register the Autlantic portal webhook (Test or Live matching the key) to:

`https://your-app-host/webhooks/autlantic`

Update `shopify.app.toml`: set real `client_id` and `application_url`. This repo ships `embedded = false` and `read_orders,write_orders` only — payment session scopes are granted by the payments extension on first deploy.

Full OAuth + durable token storage should replace the env token map before App Store / wide distribution.

## Local Partner login

Interactive (run yourself in a terminal):

```bash
shopify auth login
# then create / link the app in Partner Dashboard and deploy when Payments Partner status allows
```

This environment cannot complete Payments Partner approval for you.

## Limits (honest)

- Production checkout listing is blocked without Payments Partner approval
- One-time refunds are manual (merchant sends USDC back); `/refund` rejects the Shopify refund session with that message
- Session / activity state defaults to a local JSON file with atomic writes — single-instance only; replace for multi-instance production
- `serve()` starts with the process; use a process manager (or container) in production

## Development notes

- Do not commit real `abk_live_*`, `whsec_*`, or Shopify secrets. Use placeholders from `.env.example`.
- Billing logic stays in the hosted API; this app maps Shopify payment sessions ↔ Autlantic payment links.
- Smoke test signs and verifies a webhook body with `whsec_test` only (no live network).

## Mirror

Source of truth stays in this repo. On tag `integrations/shopify/v*`, [`.github/workflows/sync-shopify-mirror.yml`](../../.github/workflows/sync-shopify-mirror.yml) pushes to **https://github.com/Autlantic/shopify-autlantic** (rewrites `workspace:*` → npm range for `@autlantic/payments-recurring`).

One-time: create the empty public repo `Autlantic/shopify-autlantic`, then add Actions secret **`SHOPIFY_MIRROR_TOKEN`**. See [`sdks/PUBLISHING.md`](../../sdks/PUBLISHING.md).

## License

MIT · Autlantic Limited (UK company no. 17422039)
