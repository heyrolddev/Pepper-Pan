import Image from "next/image";

/**
 * The Pepper Pan wordmark plaque. Its own artwork is a dark plaque with a
 * red border, so it sits happily on both the cream and ink backgrounds.
 */
export function Logo({
  className = "",
  width = 200,
  priority = false,
}: {
  className?: string;
  width?: number;
  priority?: boolean;
}) {
  // Source art is 7329 × 2511 (≈2.92:1) once trimmed.
  const height = Math.round(width / 2.92);

  return (
    <Image
      src="/pepper-pan-logo.png"
      alt="Pepper Pan"
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
