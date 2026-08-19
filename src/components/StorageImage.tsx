import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { normalizePublicStorageUrl, storagePathFromValue } from "../lib/storage";

type StorageImageProps = {
  bucket: string;
  value?: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
};

export function StorageImage({ bucket, value, alt, className, fallback }: StorageImageProps) {
  const src = normalizePublicStorageUrl(bucket, value);
  const storagePath = storagePathFromValue(bucket, value);
  const [signedSrc, setSignedSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setFailed(false);
    setSignedSrc("");

    if (!storagePath) return;

    supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("[storage] Could not create signed image URL", { bucket, storagePath, error });
          return;
        }
        setSignedSrc(data?.signedUrl ?? "");
      })
      .catch((reason) => {
        if (!cancelled) console.warn("[storage] Signed image URL failed", { bucket, storagePath, reason });
      });

    return () => {
      cancelled = true;
    };
  }, [bucket, src, storagePath]);

  const imageSrc = failed && signedSrc ? signedSrc : src || signedSrc;

  if (failed && !signedSrc) return <>{fallback}</>;
  if (!imageSrc) return <>{fallback}</>;

  return (
    <img
      alt={alt}
      className={className}
      src={imageSrc}
      onError={() => {
        if (!failed && signedSrc && imageSrc !== signedSrc) {
          setFailed(true);
          return;
        }
        console.warn("[storage] Image failed to render", { bucket, src: imageSrc });
        setFailed(true);
      }}
    />
  );
}
