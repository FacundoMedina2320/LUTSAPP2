import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const getString = (form: FormData, key: string) =>
  typeof form.get(key) === "string" ? String(form.get(key)) : "";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
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

    const role = userData.user.app_metadata?.role ?? userData.user.user_metadata?.role;
    if (role !== "admin") {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse({ error: "Expected multipart/form-data" }, 400);
    }

    const form = await req.formData();
    const name = getString(form, "name");
    const slug = getString(form, "slug");
    const description = getString(form, "description");
    const categoryId = getString(form, "category_id");
    const currency = getString(form, "currency") || "USD";
    const previewBeforePath = getString(form, "preview_before_path") || null;
    const previewAfterPath = getString(form, "preview_after_path") || null;
    const isPremium = getString(form, "is_premium") === "true";
    const priceCents = Number(getString(form, "price_cents") || "0");
    const cubeFile = form.get("cube_file");

    if (!name || !slug) {
      return jsonResponse({ error: "name and slug required" }, 400);
    }

    if (!Number.isFinite(priceCents) || priceCents < 0) {
      return jsonResponse({ error: "price_cents invalid" }, 400);
    }

    if (!(cubeFile instanceof File)) {
      return jsonResponse({ error: "cube_file required" }, 400);
    }

    const fileExt = cubeFile.name.split(".").pop()?.toLowerCase();
    if (fileExt !== "cube") {
      return jsonResponse({ error: "Only .cube files allowed" }, 400);
    }

    const storagePath = `cube/${slug}.cube`;
    const { error: uploadError } = await supabase.storage
      .from("lut-files")
      .upload(storagePath, cubeFile, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return jsonResponse({ error: "Upload failed", details: uploadError.message }, 500);
    }

    const { data: lut, error: lutError } = await supabase
      .from("luts")
      .insert({
        name,
        slug,
        description: description || null,
        category_id: categoryId || null,
        is_premium: isPremium,
        price_cents: priceCents,
        currency,
        preview_before_path: previewBeforePath,
        preview_after_path: previewAfterPath,
        cube_path: storagePath,
      })
      .select("id, name, slug, is_premium, price_cents, currency, cube_path")
      .single();

    if (lutError) {
      await supabase.storage.from("lut-files").remove([storagePath]);
      return jsonResponse({ error: "Insert failed", details: lutError.message }, 500);
    }

    return jsonResponse({ lut }, 201);
  } catch (_error) {
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
