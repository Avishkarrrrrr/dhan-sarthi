"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export type Mood = "idle" | "thinking" | "happy";

/**
 * Dhan Sarthi — an animated 2D advisor. The mouth opens with `amplitude` (0..1)
 * so it lip-syncs to whatever audio is playing; blinks and gently bobs when idle.
 */
export function Avatar({
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

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      const delay = 2200 + Math.random() * 2600;
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 130);
        loop();
      }, delay);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // Mouth openness: smile at rest, opens with amplitude while speaking.
  const open = speaking ? 2 + Math.min(1, amplitude) * 14 : 0;
  const eyeScaleY = blink ? 0.1 : 1;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* thinking / speaking halo */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle, #12B88633, transparent 70%)" }}
        animate={{ scale: mood === "thinking" ? [1, 1.12, 1] : speaking ? [1, 1.05, 1] : 1, opacity: mood === "thinking" || speaking ? 1 : 0.5 }}
        transition={{ duration: mood === "thinking" ? 1.1 : 0.6, repeat: Infinity }}
      />
      <motion.svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="relative drop-shadow"
      >
        {/* background disc */}
        <circle cx="100" cy="100" r="96" fill="#E6F4EE" />
        <circle cx="100" cy="100" r="96" fill="none" stroke="#12B886" strokeWidth="3" opacity="0.5" />

        {/* shoulders / blazer */}
        <path d="M40 200 C48 158 74 140 100 140 C126 140 152 158 160 200 Z" fill="#064E36" />
        <path d="M92 142 h16 l-4 22 h-8 z" fill="#0B7A4B" />
        {/* collar + shirt */}
        <path d="M86 140 L100 158 L114 140 L108 138 H92 Z" fill="#F5F7F6" />

        {/* neck */}
        <rect x="90" y="120" width="20" height="26" rx="8" fill="#E8B48C" />

        {/* head */}
        <ellipse cx="100" cy="92" rx="42" ry="46" fill="#F0C29B" />
        {/* hair */}
        <path d="M58 92 C56 56 84 42 100 42 C118 42 144 56 142 92 C140 74 128 66 100 66 C74 66 62 74 58 92Z" fill="#2A2320" />
        <path d="M58 92 C57 80 62 72 68 70 C64 82 64 90 65 98 Z" fill="#2A2320" />

        {/* eyebrows */}
        <rect x="72" y="80" width="20" height="4" rx="2" fill="#3A2F29" />
        <rect x="108" y="80" width="20" height="4" rx="2" fill="#3A2F29" />

        {/* eyes (blink via scaleY) */}
        <g transform="translate(82 92)">
          <motion.ellipse cx="0" cy="0" rx="7" ry="8" fill="#fff" style={{ scaleY: eyeScaleY }} />
          <circle cx="1" cy="1" r="3.4" fill="#2A2320" />
        </g>
        <g transform="translate(118 92)">
          <motion.ellipse cx="0" cy="0" rx="7" ry="8" fill="#fff" style={{ scaleY: eyeScaleY }} />
          <circle cx="1" cy="1" r="3.4" fill="#2A2320" />
        </g>

        {/* nose */}
        <path d="M100 96 q-4 10 0 13 q4 0 4 -2" fill="none" stroke="#D89A6E" strokeWidth="2.4" strokeLinecap="round" />

        {/* mouth: smile arc at rest; opens with amplitude while speaking */}
        {open < 2 ? (
          <path d="M88 120 Q100 130 112 120" fill="none" stroke="#8A4A3A" strokeWidth="3.4" strokeLinecap="round" />
        ) : (
          <ellipse cx="100" cy="121" rx="12" ry={open} fill="#7A3A2E" />
        )}

        {/* happy cheeks */}
        {mood === "happy" && (
          <>
            <circle cx="74" cy="110" r="5" fill="#F1948A" opacity="0.5" />
            <circle cx="126" cy="110" r="5" fill="#F1948A" opacity="0.5" />
          </>
        )}
      </motion.svg>
    </div>
  );
}
