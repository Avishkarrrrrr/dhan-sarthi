"use client";

import { useEffect, useRef, useState } from "react";
import type { Mood } from "./Avatar";

/**
 * Dhan Sarthi — the advisor's face.
 *
 * SVG artwork inside a CSS 3D stage. WebGL was tried first and was the wrong
 * tool twice over: `react-three-fiber`'s reconciler reads React internals that
 * Next 15's bundled React no longer exposes, which took the entire page down,
 * and a hand-built WebGL head in the time available would have looked worse
 * than drawn artwork anyway.
 *
 * SVG gives real control over the shapes that make a face read as a face — the
 * jaw line, the hair silhouette, the almond of an eye. The 3D stage around it
 * supplies the parallax: layers sit at different `translateZ`, so when the head
 * turns, the nose and brow genuinely move against the face behind them rather
 * than sliding as one flat picture.
 */

export function Avatar3D({
  speaking,
  amplitude,
  mood = "idle",
  size = 180,
}: {
  speaking: boolean;
  amplitude: number;
  mood?: Mood;
  size?: number;
}) {
  const [blink, setBlink] = useState(false);
  const [turn, setTurn] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState(0);
  const raf = useRef(0);
  const smooth = useRef(0);

  // Irregular blinks — an exactly periodic blink reads as a machine.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(
        () => {
          setBlink(true);
          setTimeout(() => setBlink(false), 115);
          loop();
        },
        2600 + Math.random() * 3400,
      );
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // Idle drift. Stillness is what makes a rendered face look dead.
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const busy = mood === "thinking";
      setTurn({
        y: Math.sin(t * (busy ? 0.85 : 0.4)) * (busy ? 11 : 8),
        x: Math.sin(t * 0.58) * 3.4 + (busy ? 2.5 : 0),
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [mood]);

  // Smooth the amplitude: raw values jitter and look like chattering teeth.
  useEffect(() => {
    let live = true;
    const tick = () => {
      if (!live) return;
      const target = speaking ? Math.max(0.12, Math.min(1, amplitude)) : 0;
      smooth.current += (target - smooth.current) * (target > smooth.current ? 0.5 : 0.22);
      setOpen(smooth.current);
      requestAnimationFrame(tick);
    };
    tick();
    return () => {
      live = false;
    };
  }, [speaking, amplitude]);

  // Mouth geometry, driven by how loud the audio is right now.
  const mouthRy = 1.6 + open * 11;
  const mouthRx = 13 - open * 2.2;
  const lidY = blink ? 0 : 1;
  const browLift = mood === "thinking" ? -3 : 0;

  return (
    <div
      style={{ width: size, height: size, perspective: `${size * 3.4}px` }}
      className="relative select-none"
      aria-hidden
    >
      {/* Stage glow — brightens with the voice so audio has a visual anchor */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 rounded-full transition-all duration-300"
        style={{
          width: size * 0.86,
          height: size * 0.86,
          transform: "translate(-50%,-52%)",
          background: "radial-gradient(circle at 50% 42%, rgba(61,224,168,0.20), transparent 64%)",
          boxShadow: speaking
            ? `0 0 ${size * 0.22}px ${size * 0.03}px rgba(61,224,168,${0.2 + open * 0.28})`
            : `0 0 ${size * 0.13}px rgba(18,184,134,0.12)`,
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateY(${turn.y}deg) rotateX(${-turn.x}deg)`,
          transition: "transform 110ms linear",
        }}
      >
        <svg viewBox="0 0 200 210" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="ds-skin" x1="0.3" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor="#FBDCC0" />
              <stop offset="55%" stopColor="#F0C29E" />
              <stop offset="100%" stopColor="#D9A47F" />
            </linearGradient>
            <linearGradient id="ds-hair" x1="0.2" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#3A2A1E" />
              <stop offset="100%" stopColor="#1B120C" />
            </linearGradient>
            <linearGradient id="ds-coat" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0E8C57" />
              <stop offset="100%" stopColor="#064E36" />
            </linearGradient>
            <radialGradient id="ds-blush" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#E08B7A" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#E08B7A" stopOpacity="0" />
            </radialGradient>
            {/* Keeps the pupils inside the eye when the gaze shifts */}
            <clipPath id="ds-eye-l">
              <ellipse cx="78" cy="96" rx="13" ry="9" />
            </clipPath>
            <clipPath id="ds-eye-r">
              <ellipse cx="122" cy="96" rx="13" ry="9" />
            </clipPath>
          </defs>

          {/* ---- Shoulders, set furthest back ---- */}
          <g style={{ transform: `translateZ(${-size * 0.13}px)`, transformStyle: "preserve-3d" }}>
            <path d="M32 210 C34 176 62 162 100 162 C138 162 166 176 168 210 Z" fill="url(#ds-coat)" />
            {/* Lapels */}
            <path d="M100 162 L84 210 L74 210 L92 165 Z" fill="#053E2B" opacity="0.85" />
            <path d="M100 162 L116 210 L126 210 L108 165 Z" fill="#053E2B" opacity="0.85" />
            {/* Collar accent in the brand's own green */}
            <path d="M100 163 L93 180 L100 188 L107 180 Z" fill="#3DE0A8" opacity="0.9" />
          </g>

          {/* ---- Neck ---- */}
          <g style={{ transform: `translateZ(${-size * 0.04}px)`, transformStyle: "preserve-3d" }}>
            <path d="M86 140 L86 168 Q100 176 114 168 L114 140 Z" fill="#DFAA85" />
            <path d="M86 140 L86 152 Q100 160 114 152 L114 140 Z" fill="#C8916E" opacity="0.6" />
          </g>

          {/* ---- Ears ---- */}
          <g style={{ transform: `translateZ(${size * 0.01}px)`, transformStyle: "preserve-3d" }}>
            <ellipse cx="58" cy="100" rx="7" ry="11" fill="#E8B891" />
            <ellipse cx="142" cy="100" rx="7" ry="11" fill="#E8B891" />
          </g>

          {/* ---- Head ---- */}
          <g style={{ transform: `translateZ(${size * 0.03}px)`, transformStyle: "preserve-3d" }}>
            {/* Jaw is narrower than the cranium — the single thing that stops a
                face reading as a ball with features stuck on it. */}
            <path
              d="M62 92 C62 58 78 42 100 42 C122 42 138 58 138 92
                 C138 118 128 142 100 148 C72 142 62 118 62 92 Z"
              fill="url(#ds-skin)"
            />
            {/* Cheeks */}
            <ellipse cx="74" cy="112" rx="13" ry="9" fill="url(#ds-blush)" />
            <ellipse cx="126" cy="112" rx="13" ry="9" fill="url(#ds-blush)" />
          </g>

          {/* ---- Hair, forward of the face so it wraps the brow ---- */}
          <g style={{ transform: `translateZ(${size * 0.05}px)`, transformStyle: "preserve-3d" }}>
            <path
              d="M60 92 C56 56 76 36 100 36 C124 36 144 56 140 92
                 C138 78 132 70 126 68 C116 74 92 76 78 68 C70 72 62 78 60 92 Z"
              fill="url(#ds-hair)"
            />
            {/* A little volume on the side so the silhouette isn't a helmet */}
            <path d="M58 88 C54 70 62 56 72 50 C64 62 60 74 62 90 Z" fill="#2A1D14" />
          </g>

          {/* ---- Brows ---- */}
          <g
            style={{
              transform: `translateZ(${size * 0.075}px) translateY(${browLift}px)`,
              transformStyle: "preserve-3d",
              transition: "transform 260ms ease",
            }}
          >
            <path d="M66 82 Q78 76 90 81" stroke="#2A1D14" strokeWidth="4.2" fill="none" strokeLinecap="round" />
            <path d="M110 81 Q122 76 134 82" stroke="#2A1D14" strokeWidth="4.2" fill="none" strokeLinecap="round" />
          </g>

          {/* ---- Eyes ---- */}
          <g style={{ transform: `translateZ(${size * 0.07}px)`, transformStyle: "preserve-3d" }}>
            {[
              { cx: 78, clip: "ds-eye-l" },
              { cx: 122, clip: "ds-eye-r" },
            ].map(({ cx, clip }) => (
              <g key={cx}>
                <ellipse cx={cx} cy={96} rx={13} ry={9} fill="#FFFFFF" />
                <g clipPath={`url(#${clip})`}>
                  {/* Pupils lag the head turn so the gaze stays on the viewer */}
                  <circle cx={cx - turn.y * 0.16} cy={96} r={5.4} fill="#14261C" />
                  <circle cx={cx - turn.y * 0.16 - 1.7} cy={94.2} r={1.7} fill="#FFFFFF" opacity="0.9" />
                </g>
                {/* Upper lid — drops to close the eye on a blink */}
                <ellipse
                  cx={cx}
                  cy={96 - 9 + (blink ? 9 : 0)}
                  rx={13.4}
                  ry={9}
                  fill="url(#ds-skin)"
                  style={{ transition: "cy 90ms ease", opacity: lidY === 0 ? 1 : 1 }}
                />
                {/* Lash line */}
                <path
                  d={`M${cx - 13} 94 Q${cx} ${blink ? 96 : 87} ${cx + 13} 94`}
                  stroke="#2A1D14"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  style={{ transition: "d 90ms ease" }}
                />
              </g>
            ))}
          </g>

          {/* ---- Nose: furthest forward, which is what sells the parallax ---- */}
          <g style={{ transform: `translateZ(${size * 0.1}px)`, transformStyle: "preserve-3d" }}>
            <path
              d="M100 100 L96 116 Q100 119 104 116 Z"
              fill="#E3AE87"
            />
            <path d="M95 117 Q100 121 105 117" stroke="#C8916E" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>

          {/* ---- Mouth: geometry follows the audio amplitude ---- */}
          <g style={{ transform: `translateZ(${size * 0.085}px)`, transformStyle: "preserve-3d" }}>
            {open < 0.12 ? (
              // At rest: a warm closed smile, not a flat line.
              <path
                d="M88 131 Q100 139 112 131"
                stroke="#B4595C"
                strokeWidth="3.4"
                fill="none"
                strokeLinecap="round"
              />
            ) : (
              <>
                <ellipse cx={100} cy={132} rx={mouthRx} ry={mouthRy} fill="#8E3A42" />
                {/* Tongue, only once the mouth is genuinely open */}
                {open > 0.4 && (
                  <ellipse cx={100} cy={132 + mouthRy * 0.42} rx={mouthRx * 0.55} ry={mouthRy * 0.34} fill="#C2555E" />
                )}
                {/* Upper teeth catch the light on wider vowels */}
                {open > 0.28 && (
                  <rect
                    x={100 - mouthRx * 0.7}
                    y={132 - mouthRy}
                    width={mouthRx * 1.4}
                    height={Math.min(3.4, mouthRy * 0.36)}
                    rx={1.4}
                    fill="#FFF6F2"
                    opacity="0.92"
                  />
                )}
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

export default Avatar3D;
