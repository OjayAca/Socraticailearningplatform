"use client";

import type { ReactElement } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/** Adds a visible label without introducing a layout wrapper or a second button. */
export function Tooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            collisionPadding={8}
            className="z-[100] max-w-[min(18rem,calc(100vw-1rem))] break-words rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium leading-5 text-white shadow-lg dark:bg-slate-100 dark:text-slate-950"
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-slate-950 dark:fill-slate-100" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
