import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ManifestItem = {
  slug: string;
  name: string;
  description?: string | null;
  category?: string | null;
  is_premium?: boolean | null;
  price_cents?: number | null;
  currency?: string | null;
};

type SyncPayload = {
  items?: ManifestItem[];
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

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

    const payload = (await req.json()) as SyncPayload;
    const items = payload.items ?? [];

    if (!Array.isArray(items) || items.length === 0) {
      return jsonResponse({ error: "items array required" }, 400);
    }

    const errors: string[] = [];
    const upserts: unknown[] = [];

    for (const item of items) {
      if (!item.slug || !item.name) {
        errors.push("Missing slug or name for an item.");
        continue;
      }

      const slug = slugify(item.slug);
      if (!slug) {
        errors.push(`Invalid slug for item: ${item.slug}`);
        continue;
      }

      const cubePath = `cube/${slug}.cube`;
      const beforePath = `images/${slug}-before.jpg`;
      const afterPath = `images/${slug}-after.jpg`;

      const { data: cubeObjects, error: cubeError } = await supabase.storage
        .from("luts")
        .list("cube", { search: `${slug}.cube` });

      if (cubeError || !cubeObjects?.some((obj) => obj.name === `${slug}.cube`)) {
        errors.push(`Missing cube file for ${slug}: ${cubePath}`);
        continue;
      }

      const { data: beforeObjects } = await supabase.storage
        .from("luts")
        .list("images", { search: `${slug}-before.jpg` });

      const { data: afterObjects } = await supabase.storage
        .from("luts")
        .list("images", { search: `${slug}-after.jpg` });

      const hasBefore = beforeObjects?.some((obj) => obj.name === `${slug}-before.jpg`) ?? false;
      const hasAfter = afterObjects?.some((obj) => obj.name === `${slug}-after.jpg`) ?? false;

      const beforeUrl = hasBefore
        ? supabase.storage.from("luts").getPublicUrl(beforePath).data.publicUrl
        : null;
      const afterUrl = hasAfter
        ? supabase.storage.from("luts").getPublicUrl(afterPath).data.publicUrl
        : null;

      let categoryId: string | null = null;
      if (item.category) {
        const categorySlug = slugify(item.category);
        if (categorySlug) {
          const { data: categoryRow, error: categoryError } = await supabase
            .from("categories")
            .select("id")
            .eq("slug", categorySlug)
            .maybeSingle();

          if (categoryError) {
            errors.push(`Failed to lookup category for ${slug}`);
            continue;
          }

          if (categoryRow?.id) {
            categoryId = categoryRow.id;
          } else {
            const { data: createdCategory, error: createError } = await supabase
              .from("categories")
              .insert({ name: item.category, slug: categorySlug })
              .select("id")
              .single();

            if (createError || !createdCategory?.id) {
              errors.push(`Failed to create category for ${slug}`);
              continue;
            }

            categoryId = createdCategory.id;
          }
        }
      }

      upserts.push({
        slug,
        name: item.name,
        description: item.description ?? null,
        category_id: categoryId,
        is_premium: Boolean(item.is_premium),
        price_cents: item.price_cents ?? 0,
        currency: item.currency ?? "USD",
        cube_path: cubePath,
        before_url: beforeUrl,
        after_url: afterUrl,
      });
    }

    if (errors.length > 0) {
      return jsonResponse({ error: "sync failed", details: errors }, 400);
    }

    const { error: upsertError } = await supabase
      .from("luts")
      .upsert(upserts, { onConflict: "slug" });

    if (upsertError) {
      return jsonResponse({ error: "upsert failed", details: upsertError.message }, 500);
    }

    return jsonResponse({ ok: true, count: upserts.length }, 200);
  } catch (_error) {
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
