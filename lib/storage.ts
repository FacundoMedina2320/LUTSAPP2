import { supabase } from "./supabase";

const PREVIEW_BUCKET = "lut-previews";

export const getPreviewUrl = (path?: string | null) => {
  if (!path) return null;
  const { data } = supabase.storage.from(PREVIEW_BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
};
