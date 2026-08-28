import type { ReactNode } from "react";

/**
 * Infinite ticker band. The children are rendered twice so the CSS
 * translateX(-50%) loop is seamless.
 */
export function Marquee({
  items,
  className = "",
  trackClassName = "",
  separator = "✦",
}: {
  items: ReactNode[];
  className?: string;
  trackClassName?: string;
  separator?: ReactNode;
}) {
  const run = (key: string) => (
    <div className="flex shrink-0 items-center" key={key} aria-hidden={key === "b"}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          <span className="px-6">{item}</span>
          <span className="opacity-60">{separator}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className={`overflow-hidden ${className}`}>
      <div className={`marquee-track ${trackClassName}`}>
        {run("a")}
        {run("b")}
      </div>
    </div>
  );
}
