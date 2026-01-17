import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type DownloadRequest = {
  lut_id?: string;
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = (await req.json()) as DownloadRequest;
    if (!body.lut_id) {
      return jsonResponse({ error: "lut_id required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Server not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: lut, error: lutError } = await supabase
      .from("luts")
      .select("id,is_premium,cube_path")
      .eq("id", body.lut_id)
      .single();

    if (lutError || !lut) {
      return jsonResponse({ error: "LUT not found" }, 404);
    }

    if (lut.is_premium) {
      const { data: entitlement, error: entitlementError } = await supabase
        .from("entitlements")
        .select("id,expires_at")
        .eq("user_id", userData.user.id)
        .eq("lut_id", lut.id)
        .limit(1)
        .maybeSingle();

      const { data: subscriptionEntitlement, error: subscriptionError } = await supabase
        .from("entitlements")
        .select("id,expires_at")
        .eq("user_id", userData.user.id)
        .eq("source", "subscription")
        .is("lut_id", null)
        .limit(1)
        .maybeSingle();

      if (
        (entitlementError && entitlementError.code !== "PGRST116") ||
        (subscriptionError && subscriptionError.code !== "PGRST116")
      ) {
        return jsonResponse({ error: "Entitlement check failed" }, 500);
      }

      const hasEntitlement =
        entitlement && (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date());
      const hasSubscription =
        subscriptionEntitlement &&
        (!subscriptionEntitlement.expires_at ||
          new Date(subscriptionEntitlement.expires_at) > new Date());

      if (!hasEntitlement && !hasSubscription) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
    }

    await supabase.from("downloads").insert({
      user_id: userData.user.id,
      lut_id: lut.id,
      source: "app",
    });

    const { data: signed, error: signedError } = await supabase.storage
      .from("luts")
      .createSignedUrl(lut.cube_path, 60);

    if (signedError || !signed?.signedUrl) {
      return jsonResponse({ error: "Signed URL failed" }, 500);
    }

    return jsonResponse({ url: signed.signedUrl }, 200);
  } catch (_error) {
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
