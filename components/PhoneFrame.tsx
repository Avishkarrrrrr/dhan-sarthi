"use client";

import { ReactNode } from "react";

/** A mobile device frame that wraps the whole app for a "banking app" feel. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div className="relative h-[820px] max-h-[92vh] overflow-hidden rounded-[2.75rem] border-[10px] border-neutral-900 bg-white shadow-phone">
        {/* notch */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-30 h-6 w-36 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
        <div className="phone-scroll flex h-full flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
