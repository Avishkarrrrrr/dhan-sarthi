"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Avatar, type Mood } from "./Avatar";

/**
 * Picks the avatar to show.
 *
 * The dimensional avatar is CSS-3D, so it needs no GPU and cannot fail to
 * load — but it animates continuously, which is exactly what someone who has
 * asked for reduced motion does not want. They get the calmer 2D advisor,
 * which still lip-syncs.
 *
 * Client-only because both read `window` for their animation clocks.
 */

const Avatar3D = dynamic(() => import("./Avatar3D").then((m) => m.Avatar3D), {
  ssr: false,
  loading: () => null,
});

export function AdvisorAvatar({
  speaking,
  amplitude,
  mood = "idle",
  size = 180,
  prefer3d = true,
}: {
  speaking: boolean;
  amplitude: number;
  mood?: Mood;
  size?: number;
  prefer3d?: boolean;
}) {
  const [use3d, setUse3d] = useState(false);

  useEffect(() => {
    if (!prefer3d) return;
    // Respect a user who has asked for less motion: the 3D head never stops
    // moving, so for them the calmer 2D avatar is the correct answer.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setUse3d(!reduced);
  }, [prefer3d]);

  if (!use3d) return <Avatar speaking={speaking} amplitude={amplitude} mood={mood} size={size} />;
  return <Avatar3D speaking={speaking} amplitude={amplitude} mood={mood} size={size} />;
}
