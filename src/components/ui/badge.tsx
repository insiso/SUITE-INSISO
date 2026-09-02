import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Clases de color (ej. desde los mapas de constants.ts) */
  color?: string;
}

export function Badge({ className, color, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        color ?? "bg-slate-100 text-slate-700 ring-slate-200",
        className
      )}
      {...props}
    />
  );
}
