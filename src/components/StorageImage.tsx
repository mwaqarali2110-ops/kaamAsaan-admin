import { useEffect, useState, type ReactNode } from "react";
import { normalizePublicStorageUrl } from "../lib/storage";

type StorageImageProps = {
  bucket: string;
  value?: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
};

export function StorageImage({ bucket, value, alt, className, fallback }: StorageImageProps) {
  const src = normalizePublicStorageUrl(bucket, value);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) return <>{fallback}</>;

  return (
    <img
      alt={alt}
      className={className}
      src={src}
      onError={() => {
        console.warn("[storage] Image failed to render", { bucket, src });
        setFailed(true);
      }}
    />
  );
}
