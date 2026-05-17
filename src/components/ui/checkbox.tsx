"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, Props>(
  ({ className, label, id, checked, ...props }, ref) => {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    return (
      <label
        htmlFor={inputId}
        className={cn(
          "group flex cursor-pointer items-center gap-2 rounded-md py-1.5 text-sm",
          className,
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border border-input bg-background transition-colors",
            checked && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
        <input
          id={inputId}
          ref={ref}
          type="checkbox"
          className="sr-only"
          checked={checked}
          {...props}
        />
        {label ? <span className="select-none">{label}</span> : null}
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";
