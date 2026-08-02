import type { ImgHTMLAttributes } from "react";

type MindGuideLogoProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt"
> & {
  alt?: string;
  decorative?: boolean;
};

/** The official MINDGUIDE brain-and-speech-bubble brand mark. */
export function MindGuideLogo({
  alt = "MINDGUIDE logo",
  decorative = false,
  className = "",
  ...props
}: MindGuideLogoProps) {
  return (
    <img
      src="/mindguide-logo.png"
      alt={decorative ? "" : alt}
      aria-hidden={decorative || undefined}
      className={`object-contain ${className}`}
      {...props}
    />
  );
}
