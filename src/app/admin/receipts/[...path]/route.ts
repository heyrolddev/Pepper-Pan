import { NextResponse } from "next/server";
import { can, getViewer } from "@/lib/auth";
import { readPrivateFile } from "@/lib/storage";
import { RECEIPT_PREFIX } from "@/lib/media";

/**
 * A customer's proof of payment, shown to the shop and to nobody else.
 *
 * Before 0067 these screenshots sat in the public bucket and the order
 * carried the public URL — a GCash receipt, with the sender's name, number
 * and often their wallet balance, on a link that needed no login. This is
 * what replaced it: the order stores a path, the path opens nothing, and
 * the file is only ever fetched by a handler that has just checked who is
 * asking.
 *
 * SECURITY: layouts do not run for route handlers. `/admin/layout.tsx`
 * gates every *page* under /admin and none of that applies here, so the
 * check below is the only thing standing between a URL and a customer's
 * banking screen. The same reasoning as `/admin/backup/download`.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const viewer = await getViewer();
  // "orders" rather than "business": the person verifying a GCash payment is
  // whoever is on the till, not only the owner. Anything less than staff gets
  // the same answer as a path that does not exist — a 403 on a real receipt
  // and a 404 on a made-up one would together confirm which orders have one.
  if (!can(viewer, "orders")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { path } = await params;
  const joined = path.map(decodeURIComponent).join("/");

  // The handler serves the receipts folder and nothing else. Without this it
  // would serve any object in the private bucket to anyone with a staff
  // login, which is a wider door than this file is meant to be.
  if (!joined.startsWith(`${RECEIPT_PREFIX}/`) || joined.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = await readPrivateFile(joined);
  if ("error" in file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.type,
      // Private, and never by a shared cache: this is one customer's
      // banking screenshot and a CDN copy of it would outlive every check
      // above.
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
