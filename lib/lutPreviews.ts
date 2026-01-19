import { supabase } from "./supabase";

type PreviewUrls = {
  beforeUrl: string | null;
  afterUrl: string | null;
};

export const getPreviewUrls = (
  beforePath?: string | null,
  afterPath?: string | null
): PreviewUrls => {
  const beforeUrl = beforePath
    ? supabase.storage.from("lut-previews").getPublicUrl(beforePath).data.publicUrl
    : null;
  const afterUrl = afterPath
    ? supabase.storage.from("lut-previews").getPublicUrl(afterPath).data.publicUrl
    : null;

  return { beforeUrl, afterUrl };
};
