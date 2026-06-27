import { useEffect, useState } from "react";

type ImagePixelSizeBadgeProps = {
  width?: number | null;
  height?: number | null;
  src?: string | null;
  className?: string;
};

function normalizeDimension(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export function ImagePixelSizeBadge({ width, height, src, className = "" }: ImagePixelSizeBadgeProps) {
  const propWidth = normalizeDimension(width);
  const propHeight = normalizeDimension(height);
  const hasPropDimensions = propWidth !== null && propHeight !== null;
  const [loadedDimensions, setLoadedDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setLoadedDimensions(null);
    if (hasPropDimensions || !src || typeof Image === "undefined") return;
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const w = normalizeDimension(image.naturalWidth);
      const h = normalizeDimension(image.naturalHeight);
      if (w && h) {
        setLoadedDimensions({ width: w, height: h });
      }
    };
    image.onerror = () => {
      if (!cancelled) setLoadedDimensions(null);
    };
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [hasPropDimensions, src]);

  const displayWidth = hasPropDimensions ? propWidth : loadedDimensions?.width ?? null;
  const displayHeight = hasPropDimensions ? propHeight : loadedDimensions?.height ?? null;
  if (!displayWidth || !displayHeight) return null;
  const label = `${displayWidth}x${displayHeight}`;
  const mergedClassName = ["image-pixel-size-badge", className].filter(Boolean).join(" ");
  return (
    <span className={mergedClassName} title={`真实像素尺寸 ${label}`} aria-label={`真实像素尺寸 ${label}`}>
      {label}
    </span>
  );
}