import { serve } from "@hono/node-server";
import {
  parseBillingWebhookEvent,
  verifyBillingWebhookDetailed,
} from "@autlantic/payments-recurring";
import { Hono } from "hono";
import { appBaseUrl, createBilling, payoutAddress, webhookSecret } from "./lib/billing.js";
import {
  paymentSessionReject,
  paymentSessionResolve,
  refundSessionReject,
  shopAccessToken,
} from "./lib/shopify-payments.js";
import {
  addActivity,
  alreadyProcessed,
  findSessionByPaymentLink,
  getSession,
  listActivity,
  markProcessed,
  markSession,
  putSession,
} from "./lib/state.js";

const app = new Hono();

app.get("/", (c) =>
  c.html(`<!doctype html>
<html><head><meta charset="utf-8"><title>Autlantic Billing for Shopify</title>
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#0b1220;color:#e8eefc}
main{max-width:640px;margin:48px auto;padding:0 20px}
img{height:28px;width:auto}
code{background:#1a2438;padding:2px 6px;border-radius:6px}
.card{background:#121a2b;border:1px solid #243049;border-radius:14px;padding:20px;margin-top:20px}
</style></head>
<body><main>
<img src="/wordmark.svg" alt="Autlantic" onerror="this.style.display='none'"/>
<h1>Autlantic Billing for Shopify</h1>
<p>USDC on Base. Customers pay on hosted Autlantic checkout.</p>
<div class="card">
<p><strong>Webhook</strong><br/><code>${appBaseUrl()}/webhooks/autlantic</code></p>
<p><strong>Payment session</strong><br/><code>${appBaseUrl()}/payment</code></p>
<p>Checkout listing requires Shopify Payments Partner approval for the offsite payments extension.</p>
</div>
</main></body></html>`),
);

app.get("/health", (c) => c.json({ ok: true, service: "autlantic-shopify" }));

app.get("/admin/activity", (c) => c.json({ activity: listActivity() }));

/**
 * Shopify Payments Apps offsite payment session.
 * Shopify POSTs order/payment data; we return { redirect_url }.
 */
app.post("/payment", async (c) => {
  const shopDomain = c.req.header("Shopify-Shop-Domain") ?? "";
  const body = await c.req.json<Record<string, unknown>>();
  const gid = String(body.id ?? body.gid ?? "");
  const amount = String(
    (body.amount as { value?: string } | undefined)?.value ??
      (body.amount as string | undefined) ??
      "",
  );
  const currency = String(
    (body.amount as { currency?: string } | undefined)?.currency ??
      body.currency ??
      "",
  ).toUpperCase();
  const cancelUrl = String(
    (body.payment_method as { data?: { cancel_url?: string } } | undefined)?.data?.cancel_url ??
      body.cancel_url ??
      "",
  );

  if (!gid || !shopDomain) {
    return c.json({ error: "missing payment session id or shop" }, 400);
  }
  if (!["USD", "USDC"].includes(currency)) {
    return c.json({ error: "Autlantic only supports USD or USDC" }, 422);
  }

  const amountUsdc = Number(amount);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    return c.json({ error: "invalid amount" }, 422);
  }

  try {
    const billing = createBilling();
    const payout = payoutAddress();
    if (!payout) {
      return c.json(
        { error: "Set AUTLANTIC_PAYOUT_ADDRESS_EVM (merchant EVM payout wallet)" },
        500,
      );
    }
    const successUrl = `${appBaseUrl()}/payment/return?gid=${encodeURIComponent(gid)}`;
    const created = await billing.createPaymentLink({
      amountUsdc,
      merchantRefPrefix: `shop_${gid.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}`,
      description: `Shopify payment ${gid}`,
      maxUses: 1,
      successUrl,
      cancelUrl: cancelUrl || `${appBaseUrl()}/payment/cancel?gid=${encodeURIComponent(gid)}`,
      collectEmail: true,
      payoutAddressEvm: payout,
      metadata: {
        shopify_payment_gid: gid,
        shopify_shop: shopDomain,
      },
    });

    const link = (created.paymentLink ?? {}) as { id?: string };
    const url = String(created.url ?? "");
    const linkId = String(link.id ?? "");
    if (!url || !linkId) {
      throw new Error("Payment link response missing url or id");
    }

    putSession({
      shopifyGid: gid,
      shopDomain,
      amount: String(amountUsdc),
      currency,
      gid,
      paymentLinkId: linkId,
      checkoutUrl: url,
      status: "pending",
      createdAt: Date.now(),
    });

    return c.json({ redirect_url: url }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "payment session failed";
    addActivity({ ok: false, type: "payment_session", message });
    return c.json({ error: message }, 500);
  }
});

app.get("/payment/return", async (c) => {
  const gid = c.req.query("gid") ?? "";
  return c.html(`<!doctype html><html><body style="font-family:system-ui;padding:40px">
<h1>Payment submitted</h1>
<p>Waiting for Autlantic to confirm on-chain. This window can close; Shopify updates when the webhook arrives.</p>
<p><code>${gid}</code></p>
</body></html>`);
});

app.get("/payment/cancel", async (c) => {
  const gid = c.req.query("gid") ?? "";
  const session = gid ? getSession(gid) : undefined;
  if (session) {
    const token = shopAccessToken(session.shopDomain);
    if (token) {
      try {
        await paymentSessionReject({
          shopDomain: session.shopDomain,
          accessToken: token,
          gid: session.gid,
          reasonMessage: "Customer canceled Autlantic checkout",
        });
        markSession(session.gid, "rejected");
      } catch {
        /* best effort */
      }
    }
  }
  return c.html(`<!doctype html><html><body style="font-family:system-ui;padding:40px">
<h1>Payment canceled</h1>
<p>Return to Shopify checkout to try another method.</p>
</body></html>`);
});

/**
 * Shopify refund session. One-time payment links have no Autlantic refund API —
 * reject so the merchant refunds USDC manually from their payout wallet.
 */
app.post("/refund", async (c) => {
  const shopDomain = c.req.header("Shopify-Shop-Domain") ?? "";
  const body = await c.req.json<Record<string, unknown>>();
  const gid = String(body.id ?? body.gid ?? "");
  const token = shopAccessToken(shopDomain);
  if (!gid || !shopDomain || !token) {
    return c.json({ error: "missing refund session context" }, 400);
  }
  try {
    await refundSessionReject({
      shopDomain,
      accessToken: token,
      gid,
      reasonMessage:
        "Autlantic one-time payment-link refunds are manual. Send USDC back from the merchant payout wallet.",
    });
    addActivity({ ok: true, type: "refund_session", message: `rejected ${gid}` });
    return c.json({ ok: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "refund session failed";
    addActivity({ ok: false, type: "refund_session", message });
    return c.json({ error: message }, 500);
  }
});

app.post("/webhooks/autlantic", async (c) => {
  const raw = await c.req.text();
  const signature =
    c.req.header("x-autlantic-signature") ?? c.req.header("X-Autlantic-Signature") ?? null;
  const verified = verifyBillingWebhookDetailed(webhookSecret(), raw, signature);
  if (!verified.ok) {
    addActivity({ ok: false, type: "", message: `signature ${verified.reason ?? "unknown"}` });
    return c.json({ error: "Invalid webhook signature" }, 401);
  }

  const event = parseBillingWebhookEvent(raw);
  if (!event) {
    return c.json({ error: "Invalid webhook body" }, 400);
  }

  const eventId = String(event.id ?? "");
  const type = String(event.type ?? "");
  if (eventId && alreadyProcessed(eventId)) {
    addActivity({ ok: true, type, message: `duplicate ${eventId}` });
    return c.json({ received: true, duplicate: true });
  }

  try {
    if (type === "payment.paid") {
      await handlePaymentPaid(event.data as Record<string, unknown>);
    }
    if (eventId) markProcessed(eventId);
    addActivity({ ok: true, type, message: eventId || "accepted" });
    return c.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler failed";
    addActivity({ ok: false, type, message });
    return c.json({ error: message }, 500);
  }
});

async function handlePaymentPaid(data: Record<string, unknown>): Promise<void> {
  const payment = (data.payment as Record<string, unknown> | undefined) ?? data;
  const metadata = (payment.metadata as Record<string, string> | undefined) ?? {};
  const gid = metadata.shopify_payment_gid ?? "";
  const linkId = metadata.paymentLinkId ?? "";
  const session = (gid ? getSession(gid) : undefined) ?? (linkId ? findSessionByPaymentLink(linkId) : undefined);
  if (!session) {
    return;
  }
  const token = shopAccessToken(session.shopDomain);
  if (!token) {
    throw new Error(`No Shopify access token configured for ${session.shopDomain}`);
  }
  await paymentSessionResolve({
    shopDomain: session.shopDomain,
    accessToken: token,
    gid: session.gid,
  });
  markSession(session.gid, "resolved");
}

const port = Number(process.env.PORT ?? 3458);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Autlantic Shopify app listening on :${port}`);
});

export default app;
