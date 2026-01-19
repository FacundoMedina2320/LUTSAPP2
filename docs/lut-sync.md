# LUT Sync (Sheets/Excel -> CSV -> manifest.json -> Sync)

## 1) Storage convention (bucket: luts)

```
cube/<slug>.cube
images/<slug>-before.jpg
images/<slug>-after.jpg
```

Example:

```
cube/cinematic-saturation.cube
images/cinematic-saturation-before.jpg
images/cinematic-saturation-after.jpg
```

## 2) CSV template

Required columns:

```
slug,name
```

Recommended full template:

```
slug,name,description,category,tags,is_premium,price_cents,currency
```

Example:

```
slug,name,description,category,tags,is_premium,price_cents,currency
cinematic-saturation,Cinematic Saturation,"LUT cinematográfico con saturación intensa",cinematic,"cinematic,contrast",TRUE,499,USD
basic-saturation,Basic Saturation,"LUT gratuito de saturación",cinematic,"basic,free",FALSE,0,USD
```

## 3) Convert CSV -> manifest.json

```
node scripts/manifest-from-csv.ts data/luts.csv data/manifest.json
```

The manifest JSON structure:

```json
{
  "items": [
    {
      "slug": "cinematic-saturation",
      "name": "Cinematic Saturation",
      "description": "LUT cinematográfico con saturación intensa",
      "category": "cinematic",
      "tags": ["cinematic", "contrast"],
      "is_premium": true,
      "price_cents": 499,
      "currency": "USD"
    }
  ]
}
```

## 4) Sync via Edge Function

Deploy the function:

```
supabase functions deploy sync-luts
```

Run the sync:

```
curl -X POST \
  "$SUPABASE_URL/functions/v1/sync-luts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d @data/manifest.json
```

## 5) What the sync does

- Validates `cube/<slug>.cube` exists in the `lut-files` bucket.
- Optionally sets `preview_before_path` and `preview_after_path` using `images/<slug>-before.jpg` and `images/<slug>-after.jpg` from `lut-previews`.
- Upserts categories by slug (creates if missing).
- Upserts LUTs by `slug` with normalized metadata.

## 6) Notes

- `category` uses the normalized `categories` table and writes `category_id` into `luts`.
- If image files are missing, `preview_before_path`/`preview_after_path` will be null.
- The sync does not store `tags` unless you add a column to `luts` for them.
