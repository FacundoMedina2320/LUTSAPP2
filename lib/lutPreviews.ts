import { supabase } from "./supabase";

type PreviewUrls = {
  beforeUrl: string | null;
  afterUrl: string | null;
};

type PreviewOptions = {
  useSignedUrls?: boolean;
  expiresIn?: number;
};

type CachedPreview = {
  url: string | null;
  expiresAt: number | null;
};

const PREVIEW_BUCKET = "lut-previews";
const DEFAULT_SIGNED_TTL = 60 * 60;
const previewCache = new Map<string, CachedPreview>();

const getCacheKey = (path: string, options?: PreviewOptions) => {
  if (!options?.useSignedUrls) {
    return `public:${path}`;
  }
  return `signed:${options.expiresIn ?? DEFAULT_SIGNED_TTL}:${path}`;
};

const readCache = (key: string) => {
  const cached = previewCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt && cached.expiresAt <= Date.now()) {
    previewCache.delete(key);
    return null;
  }
  return cached.url;
};

const writeCache = (key: string, url: string | null, expiresAt: number | null) => {
  previewCache.set(key, { url, expiresAt });
};

const resolvePreviewUrl = async (
  path?: string | null,
  options?: PreviewOptions
): Promise<string | null> => {
  if (!path) return null;
  const cacheKey = getCacheKey(path, options);
  const cached = readCache(cacheKey);
  if (cached !== null) return cached;

  if (options?.useSignedUrls) {
    const ttl = options.expiresIn ?? DEFAULT_SIGNED_TTL;
    const { data, error } = await supabase.storage.from(PREVIEW_BUCKET).createSignedUrl(path, ttl);
    const url = data?.signedUrl ?? null;
    if (error) {
      return null;
    }
    writeCache(cacheKey, url, Date.now() + ttl * 1000);
    return url;
  }

  const publicUrl = supabase.storage.from(PREVIEW_BUCKET).getPublicUrl(path).data.publicUrl;
  writeCache(cacheKey, publicUrl ?? null, null);
  return publicUrl ?? null;
};

export const getPreviewUrls = async (
  beforePath?: string | null,
  afterPath?: string | null,
  options?: PreviewOptions
): Promise<PreviewUrls> => {
  const [beforeUrl, afterUrl] = await Promise.all([
    resolvePreviewUrl(beforePath, options),
    resolvePreviewUrl(afterPath, options),
  ]);

  return { beforeUrl, afterUrl };
};
