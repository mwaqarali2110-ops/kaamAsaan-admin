import { supabase } from "./supabase";
import { slugify } from "./utils";

export function normalizePublicStorageUrl(bucket: string, value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const path = storagePathFromValue(bucket, trimmed);
  if (!path) return "";
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function storagePathFromValue(bucket: string, value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const marker = `/storage/v1/object/public/${bucket}/`;
      const signedMarker = `/storage/v1/object/sign/${bucket}/`;
      const publicIndex = url.pathname.indexOf(marker);
      const signedIndex = url.pathname.indexOf(signedMarker);
      if (publicIndex >= 0) return decodeURIComponent(url.pathname.slice(publicIndex + marker.length));
      if (signedIndex >= 0) return decodeURIComponent(url.pathname.slice(signedIndex + signedMarker.length));
      return "";
    } catch {
      return "";
    }
  }

  let path = trimmed.replace(/^\/+/, "");
  path = path.replace(/^storage\/v1\/object\/public\//, "");
  path = path.replace(/^storage\/v1\/object\/sign\//, "");
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
  return path;
}

export async function uploadPublicFile(bucket: string, file: File, prefix = "") {
  const extension = file.name.split(".").pop() || "bin";
  const basename = slugify(file.name.replace(/\.[^.]+$/, "")) || "asset";
  const path = `${prefix.replace(/^\/+|\/+$/g, "") ? `${prefix.replace(/^\/+|\/+$/g, "")}/` : ""}${Date.now()}-${basename}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    cacheControl: "3600",
  });
  if (error) {
    if (import.meta.env.DEV) console.error("[storage] Package image upload failed", { bucket, path, name: file.name, type: file.type, error });
    throw error;
  }

  const publicUrl = normalizePublicStorageUrl(bucket, path);
  if (import.meta.env.DEV) console.debug("[storage] Package image uploaded", { bucket, path, publicUrl });

  try {
    const response = await fetch(publicUrl, { method: "HEAD" });
    if (!response.ok) throw new Error(`Uploaded image is not publicly readable (${response.status}).`);
  } catch (reason) {
    console.warn("[storage] Public URL verification could not complete", { bucket, publicUrl, reason });
  }

  return publicUrl;
}

export async function removePublicFile(bucket: string, value?: string | null) {
  const path = storagePathFromValue(bucket, value);
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
