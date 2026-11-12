import React from "react";
import {
  AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig,
} from "remotion";

const INK = "#e8eaed";
const MET = "#3ddc97";
const BLOCKED = "#ff5c5c";
const PANEL = "rgba(10,11,13,0.90)";
const SANS = "'Inter Tight','DejaVu Sans',system-ui,sans-serif";
const MONO = "'IBM Plex Mono','DejaVu Sans Mono',monospace";

/** Fade+rise in, fade out — shared by every overlay. */
const useReveal = (outAt: number, dur?: number) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  // `dur` is the length actually being rendered, which may be shorter than the
  // composition, so the exit fade lands on the real last frame.
  const end = dur ?? durationInFrames;
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const exit = interpolate(frame, [end - outAt, end], [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { opacity: enter * exit, y: interpolate(enter, [0, 1], [18, 0]) };
};

/** Opening title. */
export const Title: React.FC<{ title: string; sub: string }> = ({ title, sub }) => {
  const { opacity, y } = useReveal(18);
  const frame = useCurrentFrame();
  const rule = interpolate(frame, [8, 34], [0, 420], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 0 120px 78px" }}>
      <div style={{ opacity, transform: `translateY(${y}px)` }}>
        <div style={{
          fontFamily: MONO, fontSize: 19, letterSpacing: "0.22em",
          color: MET, textTransform: "uppercase", marginBottom: 14,
        }}>
          AI proposes · Policy decides · Human approves
        </div>
        <div style={{ fontFamily: SANS, fontSize: 62, fontWeight: 600, color: INK, letterSpacing: "-0.02em" }}>
          {title}
        </div>
        <div style={{ width: rule, height: 2, background: MET, margin: "20px 0 16px", borderRadius: 2 }} />
        <div style={{ fontFamily: SANS, fontSize: 25, color: "rgba(232,234,237,0.72)" }}>{sub}</div>
      </div>
    </AbsoluteFill>
  );
};

/** Lower-third caption. `tone` tints the left rule and label. */
export const Caption: React.FC<{ text: string; label?: string; tone?: "met" | "blocked" | "plain"; dur?: number }> =
({ text, label, tone = "plain", dur }) => {
  const { opacity, y } = useReveal(14, dur);
  const color = tone === "blocked" ? BLOCKED : tone === "met" ? MET : INK;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-start", padding: "0 0 0 72px" }}>
      <div style={{
        opacity, transform: `translateY(${y}px)`, display: "flex", alignItems: "stretch",
        background: PANEL, borderRadius: 12, overflow: "hidden",
        boxShadow: "0 18px 44px -22px rgba(0,0,0,0.95)",
      }}>
        <div style={{ width: 5, background: color }} />
        <div style={{ padding: "18px 28px" }}>
          {label && (
            <div style={{
              fontFamily: MONO, fontSize: 14, letterSpacing: "0.18em",
              textTransform: "uppercase", color, marginBottom: 7,
            }}>{label}</div>
          )}
          <div style={{
            fontFamily: tone === "blocked" ? MONO : SANS,
            fontSize: tone === "blocked" ? 38 : 36,
            fontWeight: 600, color: INK, letterSpacing: "-0.01em",
          }}>{text}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
