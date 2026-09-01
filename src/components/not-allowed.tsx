import { hqTitle } from "@/lib/hq-theme";
/**
 * The wall, worded like a person.
 *
 * Every gated screen used to write its own version of this, which is how one
 * of them ends up saying "Forbidden" and another says nothing at all. It also
 * says what the reader CAN do instead — a dead end with no exit is how someone
 * concludes the software is broken and asks the owner for the owner's password.
 */
export function NotAllowed({
  title = "Not your screen",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
      <h2 className={hqTitle}>{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-ink-800/70">{children}</p>
    </div>
  );
}
