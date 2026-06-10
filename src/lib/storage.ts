import { supabase } from "./supabase";
import { slugify } from "./utils";

export function normalizePublicStorageUrl(bucket: string, value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  let path = trimmed.replace(/^\/+/, "");
  path = path.replace(/^storage\/v1\/object\/public\//, "");
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function uploadPublicFile(bucket: string, file: File) {
  const extension = file.name.split(".").pop() || "bin";
  const basename = slugify(file.name.replace(/\.[^.]+$/, "")) || "asset";
  const path = `${Date.now()}-${basename}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw error;

  const publicUrl = normalizePublicStorageUrl(bucket, path);
  console.debug("[storage] Saved public image URL", { bucket, publicUrl });

  try {
    const response = await fetch(publicUrl, { method: "HEAD" });
    if (!response.ok) {
      throw new Error(`Uploaded image is not publicly readable from ${bucket}. Mark the bucket as public in Supabase Storage.`);
    }
  } catch (reason) {
    if (reason instanceof Error && reason.message.includes("Mark the bucket as public")) throw reason;
    console.warn("[storage] Public URL verification could not complete", { bucket, publicUrl, reason });
  }

  return publicUrl;
}
