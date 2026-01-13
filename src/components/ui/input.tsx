import * as React from "react"

import { cn } from "@/lib/utils"

interface InputProps extends React.ComponentProps<"input"> {
  variant?: "default" | "modern";
}

function Input({ className, type, variant = "default", ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 border bg-transparent text-base outline-none transition-all duration-200",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        variant === "default" && [
          "h-9 rounded-md px-3 py-1 shadow-xs dark:bg-input/30",
        ],
        variant === "modern" && [
          "h-11 rounded-xl px-4 py-2",
          "bg-gray-50/50 dark:bg-[#0F172A]/50",
          "border-gray-200 dark:border-[#334155]",
          "hover:border-gray-300 dark:hover:border-[#475569]",
          "focus-visible:border-[#0EA5E9] focus-visible:ring-[#0EA5E9]/20",
          "placeholder:text-gray-400 dark:placeholder:text-gray-500",
          "shadow-sm hover:shadow-md focus:shadow-md",
        ],
        className
      )}
      {...props}
    />
  )
}

export { Input }
