import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  product_id?: string;
  store?: string;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  purchase_token?: string | null;
  entitlement_ids?: string[] | null;
  active_subscriptions?: string[] | null;
  all_purchase_ids?: string[] | null;
};

type RevenueCatPayload = {
  event?: RevenueCatEvent;
  type?: string;
  app_user_id?: string;
  product_id?: string;
  store?: string;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  purchase_token?: string | null;
  entitlement_ids?: string[] | null;
  active_subscriptions?: string[] | null;
  all_purchase_ids?: string[] | null;
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const subscriptionGrantEvents = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
]);

const subscriptionRevokeEvents = new Set(["CANCELLATION", "EXPIRATION", "REFUND"]);

const purchaseEvents = new Set(["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"]);

const normalizePlatform = (store?: string) => {
  if (!store) return "ios";
  if (store === "play_store" || store === "amazon" || store === "stripe") return "android";
  return "ios";
};

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!secret || token !== secret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload = (await req.json()) as RevenueCatPayload;
    const event = payload.event ?? payload;

    const eventType = event.type ?? "";
    const appUserId = event.app_user_id?.trim();
    const productId = event.product_id?.trim();

    if (!appUserId || !productId) {
      return jsonResponse({ error: "Missing app_user_id or product_id" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Server not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const platform = normalizePlatform(event.store);

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("type,lut_id")
      .eq("platform", platform)
      .eq("store_product_id", productId)
      .maybeSingle();

    if (productError) {
      return jsonResponse({ error: "Product lookup failed" }, 500);
    }

    if (!product) {
      return jsonResponse({ error: "Unknown product" }, 400);
    }

    const transactionId = event.transaction_id ?? event.original_transaction_id;
    const purchaseAt = event.purchased_at_ms ? new Date(event.purchased_at_ms) : new Date();
    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

    if (transactionId) {
      const status = subscriptionRevokeEvents.has(eventType)
        ? "canceled"
        : "purchased";

      const { error: txError } = await supabase.from("store_transactions").upsert(
        {
          user_id: appUserId,
          platform,
          store_product_id: productId,
          transaction_id: transactionId,
          purchase_token: event.purchase_token ?? null,
          status,
          purchase_at: purchaseAt.toISOString(),
          expires_at: expiresAt ? expiresAt.toISOString() : null,
          raw_payload: payload,
        },
        { onConflict: "platform,transaction_id" }
      );

      if (txError) {
        return jsonResponse({ error: "Transaction write failed" }, 500);
      }
    }

    const { error: customerError } = await supabase.from("rc_customers").upsert(
      {
        user_id: appUserId,
        rc_app_user_id: appUserId,
        entitlements: event.entitlement_ids ?? null,
        active_subscriptions: event.active_subscriptions ?? null,
        all_purchase_ids: event.all_purchase_ids ?? null,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (customerError) {
      return jsonResponse({ error: "Customer sync failed" }, 500);
    }

    if (product.type === "subscription") {
      if (subscriptionGrantEvents.has(eventType)) {
        const { data: existingEntitlement, error: existingError } = await supabase
          .from("entitlements")
          .select("id")
          .eq("user_id", appUserId)
          .eq("source", "subscription")
          .is("lut_id", null)
          .maybeSingle();

        if (existingError && existingError.code !== "PGRST116") {
          return jsonResponse({ error: "Entitlement lookup failed" }, 500);
        }

        if (existingEntitlement) {
          const { error: updateError } = await supabase
            .from("entitlements")
            .update({ expires_at: expiresAt ? expiresAt.toISOString() : null })
            .eq("id", existingEntitlement.id);

          if (updateError) {
            return jsonResponse({ error: "Entitlement write failed" }, 500);
          }
        } else {
          const { error: insertError } = await supabase.from("entitlements").insert({
            user_id: appUserId,
            lut_id: null,
            source: "subscription",
            expires_at: expiresAt ? expiresAt.toISOString() : null,
          });

          if (insertError) {
            return jsonResponse({ error: "Entitlement write failed" }, 500);
          }
        }
      }

      if (subscriptionRevokeEvents.has(eventType)) {
        const { error: revokeError } = await supabase
          .from("entitlements")
          .update({ expires_at: new Date().toISOString() })
          .eq("user_id", appUserId)
          .eq("source", "subscription")
          .is("lut_id", null);

        if (revokeError) {
          return jsonResponse({ error: "Entitlement revoke failed" }, 500);
        }
      }
    }

    if (product.type === "non_consumable" && purchaseEvents.has(eventType)) {
      const { error: entitlementError } = await supabase.from("entitlements").upsert(
        {
          user_id: appUserId,
          lut_id: product.lut_id,
          source: "one_time",
          expires_at: null,
        },
        { onConflict: "user_id,lut_id,source" }
      );

      if (entitlementError) {
        return jsonResponse({ error: "Entitlement write failed" }, 500);
      }
    }

    return jsonResponse({ ok: true }, 200);
  } catch (_error) {
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
