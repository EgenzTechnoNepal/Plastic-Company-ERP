import { cn } from "@/lib/utils";

type BrandProps = {
  className?: string;
  /** Accessible name for screen readers. */
  alt?: string;
};

/** Leaf mark only — favicon-style glyph for compact chrome. */
export function BrandMark({ className, alt = "EcoWrap Nepal" }: BrandProps) {
  return (
    <img
      src="/ecowrap-mark.png"
      alt={alt}
      className={cn("object-contain", className)}
      width={40}
      height={40}
      decoding="async"
    />
  );
}

/** Full EcoWrap Nepal lockup (icon + wordmark). */
export function BrandLogo({ className, alt = "EcoWrap Nepal" }: BrandProps) {
  return (
    <img
      src="/ecowrap-logo-lockup.png"
      alt={alt}
      className={cn("object-contain object-left", className)}
      width={220}
      height={128}
      decoding="async"
    />
  );
}
