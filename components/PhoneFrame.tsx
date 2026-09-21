"use client";

import { ReactNode } from "react";

/**
 * A device frame that wraps the app for a "banking app" feel on a desktop.
 *
 * The frame is desktop-only. On a real phone it drew a phone inside a phone —
 * bezel, notch and rounded corners eating the screen edges of a device that is
 * already the thing being simulated. Below `sm` the chrome disappears and the
 * app runs full-bleed, which is how it would actually ship.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full sm:max-w-[400px]">
      <div className="relative h-[100dvh] overflow-hidden bg-white sm:h-[820px] sm:max-h-[92vh] sm:rounded-[2.75rem] sm:border-[10px] sm:border-neutral-900 sm:shadow-phone">
        {/* notch — part of the simulated device, so desktop only */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-30 hidden h-6 w-36 -translate-x-1/2 rounded-b-2xl bg-neutral-900 sm:block" />
        {/*
          `overflow-hidden`, not `auto`: every screen panel scrolls itself, and
          two nested scrollers meant clicking anything inside one scrolled it
          independently of the frame — which silently hid panel headings.
        */}
        <div className="flex h-full flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
