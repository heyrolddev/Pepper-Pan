"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ scrolled = true }: { scrolled?: boolean }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={signingOut}
      className={`rounded-full px-3 py-2 transition-colors disabled:opacity-60 ${
        scrolled
          ? "text-ink-800 hover:text-brand-600"
          : "text-cream-100/80 hover:text-gold-400"
      }`}
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
