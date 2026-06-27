import { dataURLFromBase64, useBlobURL } from "../../lib/images";

type SideBySideCompareOverlayProps = {
  leftBlob: Blob | null;
  leftB64?: string | null;
  leftUrl?: string | null;
  rightBlob: Blob | null;
  rightB64?: string | null;
  rightUrl?: string | null;
  leftLabel: string;
  rightLabel: string;
};

export function SideBySideCompareOverlay({
  leftBlob,
  leftB64,
  leftUrl,
  rightBlob,
  rightB64,
  rightUrl,
  leftLabel,
  rightLabel,
}: SideBySideCompareOverlayProps) {
  const leftObjectURL = useBlobURL(leftBlob, leftBlob ? null : leftB64);
  const rightObjectURL = useBlobURL(rightBlob, rightBlob ? null : rightB64);
  const leftSrc = leftObjectURL || leftUrl || (leftB64 ? dataURLFromBase64(leftB64) : "");
  const rightSrc = rightObjectURL || rightUrl || (rightB64 ? dataURLFromBase64(rightB64) : "");

  return (
    <div className="side-by-side-compare-overlay">
      <ComparePanel src={leftSrc} label={leftLabel} tone="left" />
      <ComparePanel src={rightSrc} label={rightLabel} tone="right" />
    </div>
  );
}

function ComparePanel({ src, label, tone }: { src: string; label: string; tone: "left" | "right" }) {
  return (
    <div className="side-by-side-compare-panel">
      {src ? (
        <img className="side-by-side-compare-image" src={src} draggable={false} />
      ) : null}
      <div className={`side-by-side-compare-label side-by-side-compare-label-${tone}`}>
        {label}
      </div>
    </div>
  );
}
