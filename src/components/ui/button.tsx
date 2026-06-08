import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-moss text-white hover:bg-[#185747] focus-visible:ring-moss",
  secondary: "border border-ink/10 bg-white text-ink hover:bg-mint/50 focus-visible:ring-moss",
  ghost: "text-ink hover:bg-ink/5 focus-visible:ring-moss",
  danger: "bg-clay text-white hover:bg-[#964c36] focus-visible:ring-clay"
};

export function Button({ className, variant = "primary", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

