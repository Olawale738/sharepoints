import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-ink/40 focus:border-moss focus:ring-2 focus:ring-moss/20",
        className
      )}
      {...props}
    />
  );
}

