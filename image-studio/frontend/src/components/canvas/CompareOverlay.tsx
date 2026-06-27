import { useCallback, useEffect, useRef } from "react";
import { useBlobURL } from "../../lib/images";

export function CompareOverlay({
  leftBlob,
  leftB64,
  leftUrl,
  rightBlob,
  rightB64,
  rightUrl,
  split,
  onSplit,
  leftLabel,
  rightLabel,
}: {
  leftBlob: Blob | null;
  leftB64?: string | null;
  leftUrl?: string | null;
  rightBlob: Blob | null;
  rightB64?: string | null;
  rightUrl?: string | null;
  split: number;
  onSplit: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingPointerIdRef = useRef<number | null>(null);
  const leftObjectURL = useBlobURL(leftBlob, leftBlob ? null : leftB64);
  const rightObjectURL = useBlobURL(rightBlob, rightBlob ? null : rightB64);
  const leftSrc = leftObjectURL || leftUrl || "";
  const rightSrc = rightObjectURL || rightUrl || "";

  const updateSplit = useCallback((clientX: number) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = clientX - rect.left;
    onSplit(Math.max(0, Math.min(1, x / rect.width)));
  }, [onSplit]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (draggingPointerIdRef.current !== event.pointerId) return;
      updateSplit(event.clientX);
    };
    const stop = (event: PointerEvent) => {
      if (draggingPointerIdRef.current === event.pointerId) draggingPointerIdRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [updateSplit]);

  const pct = Math.round(split * 100);
  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }}>
      <img
        src={leftSrc}
        draggable={false}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "contain", userSelect: "none",
          clipPath: `inset(0 ${100 - pct}% 0 0)`,
        }}
      />
      <img
        src={rightSrc}
        draggable={false}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "contain", userSelect: "none",
          clipPath: `inset(0 0 0 ${pct}%)`,
        }}
      />
      <div
        onPointerDown={(event) => {
          event.preventDefault();
          draggingPointerIdRef.current = event.pointerId;
          updateSplit(event.clientX);
        }}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${pct}%`,
          width: 3,
          marginLeft: -1.5,
          background: "#7e5cff",
          cursor: "ew-resize",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "#7e5cff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0,
          boxShadow: "0 8px 18px rgba(0,0,0,0.28)",
        }}
        >
          {"<>"}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          background: "rgba(0,0,0,0.55)",
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 11,
          color: "#9ec5ff",
        }}
      >
        {leftLabel}
      </div>
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "rgba(0,0,0,0.55)",
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 11,
          color: "#cdb8ff",
        }}
      >
        {rightLabel}
      </div>
    </div>
  );
}
