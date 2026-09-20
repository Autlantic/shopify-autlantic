<p align="center">
  <img src="https://autlantic.com/brand/autlantic-icon-1024-master.png" alt="Autlantic" width="96" height="96" />
</p>

<h1 align="center">Autlantic Billing — Shopify</h1>

<p align="center">
  <strong>USDC payments on Base</strong><br />
  Official offsite payments app: payment sessions, hosted checkout, and signed webhooks.
</p>

<p align="center">
  <a href="https://docs.autlantic.com/guide/commerce"><img src="https://img.shields.io/badge/docs-docs.autlantic.com-5672cd?style=flat-square" alt="Docs" /></a>
  <a href="https://github.com/Autlantic/shopify-autlantic"><img src="https://img.shields.io/badge/mirror-shopify--autlantic-111827?style=flat-square" alt="Mirror" /></a>
  <a href="https://github.com/Autlantic/payments-sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" /></a>
  <a href="https://autlantic.com"><img src="https://img.shields.io/badge/product-autlantic.com-111827?style=flat-square" alt="Autlantic" /></a>
</p>

---

Part of [Autlantic Payments SDK](https://github.com/Autlantic/payments-sdk). Uses [`@autlantic/payments-recurring`](../../packages/payments-recurring). Distribute via [shopify-autlantic](https://github.com/Autlantic/shopify-autlantic) (not npm).

USDC settles to your merchant `payoutAddressEvm`. Autlantic does not custody checkout funds.

> **Checkout listing** requires an approved **Shopify Payments Partner** app. Ordinary Partner status is not enough — until then merchants cannot enable Autlantic on production checkouts.

## Why this app

Same hosted Billing API as WooCommerce — Shopify starts a payment session, the app creates a single-use payment link, the buyer pays on hosted checkout, and `payment.paid` resolves the session. API keys and webhook secrets stay on the server.

## Install

```bash
cp .env.example .env
# fill SHOPIFY_* and AUTLANTIC_* placeholders only — never commit .env
pnpm install
pnpm --filter @autlantic/shopify-billing smoke
pnpm --filter @autlantic/shopify-billing typecheck
pnpm --filter @autlantic/shopify-billing dev
```

Requires Node **20+**, a public HTTPS app URL, Autlantic portal credentials, and shop access token(s) for Payments Apps GraphQL. Store currency **USD** or **USDC**.

Set real `client_id` / `application_url` in `shopify.app.toml`. This repo ships `embedded = false` and `read_orders,write_orders` (payment scopes come from the extension on first deploy).

## Quick start

1. Set `AUTLANTIC_BILLING_API_KEY`, `AUTLANTIC_BILLING_WEBHOOK_SECRET`, and `AUTLANTIC_PAYOUT_ADDRESS_EVM`
2. Portal → Webhooks → register:

   `https://your-app-host/webhooks/autlantic`

3. After Payments Partner approval: `shopify auth login`, deploy app + `extensions/autlantic-offsite/`
4. Shopify payment session → `{ redirect_url }` → hosted pay → webhook → `paymentSessionResolve`

## What it does

| Piece | Route / path |
|-------|----------------|
| App host | `src/index.ts` (Hono) |
| Offsite extension | `extensions/autlantic-offsite/` |
| Payment session | `POST /payment` → Autlantic payment link → `{ redirect_url }` |
| Autlantic webhook | `POST /webhooks/autlantic` → `paymentSessionResolve` |
| Refund session | `POST /refund` → rejects; one-time refunds are **manual** |

## Environment

| Env var | Purpose |
|---------|---------|
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Partner app credentials |
| `SHOPIFY_APP_URL` | Public HTTPS base |
| `AUTLANTIC_BILLING_API_URL` | Default `https://billing.autlantic.com` |
| `AUTLANTIC_BILLING_API_KEY` | `abk_test_…` or `abk_live_…` |
| `AUTLANTIC_BILLING_WEBHOOK_SECRET` | Portal endpoint secret |
| `AUTLANTIC_PAYOUT_ADDRESS_EVM` | Merchant payout wallet (required) |
| `SHOPIFY_ACCESS_TOKEN` or `SHOPIFY_SHOP_TOKENS` | Payments Apps GraphQL auth |
| `PORT` | Default `3458` |

## Webhooks

Verify `x-autlantic-signature` with the portal endpoint secret. Session/activity state defaults to a local JSON file (atomic writes; single-instance only).

## Documentation

| | |
|--|--|
| [Commerce plugins](https://docs.autlantic.com/guide/commerce) | Woo / Magento / Shopify |
| [Languages](https://docs.autlantic.com/guide/languages) | All SDK surfaces |
| [Webhooks](https://docs.autlantic.com/guide/webhooks) | Signature & events |
| [Node.js SDK](https://docs.autlantic.com/api/nodejs) | `@autlantic/payments-recurring` |
| [Terms](https://autlantic.com/terms) · [Privacy](https://autlantic.com/privacy) · [Security](https://autlantic.com/security) | Legal |

## Develop

```bash
pnpm --filter @autlantic/shopify-billing smoke
pnpm --filter @autlantic/shopify-billing typecheck
```

On tag `integrations/shopify/v*`, [`.github/workflows/sync-shopify-mirror.yml`](../../.github/workflows/sync-shopify-mirror.yml) syncs [shopify-autlantic](https://github.com/Autlantic/shopify-autlantic).

## License

MIT · Operated by **Autlantic Limited** (UK company no. 17422039).

Part of [Autlantic Payments SDK](https://github.com/Autlantic/payments-sdk).
