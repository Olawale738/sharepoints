import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink/40 focus:border-moss focus:ring-2 focus:ring-moss/20",
        className
      )}
      {...props}
    />
  );
}

