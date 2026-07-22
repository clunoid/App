import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { paidMt5, isPaidMt5, userOwnsMt5, guestOwnsMt5 } from "@/lib/deriv/mt5/products";
import { readPurchaseToken } from "@/lib/deriv/mt5/purchaseToken";

export const runtime = "nodejs";

/**
 * Lightweight status for the download button: is this a paid automation, is the
 * visitor signed in, do they own it — and, for a guest, did this device already
 * pay (proof lives in the cookie + ledger, so a reload can't lose it and can't
 * lead to a second charge).
 */
type Ctx = { params: Promise<{ botId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { botId } = await params;
  if (!isPaidMt5(botId)) {
    return NextResponse.json({ paid: false, signedIn: false, owned: false, paidAsGuest: false, priceUsd: null });
  }
  const prod = paidMt5(botId)!;
  const user = await requireUser();

  let owned = false;
  let paidAsGuest = false;
  if (user) {
    owned = await userOwnsMt5(user.id, botId);
  } else {
    const token = await readPurchaseToken();
    paidAsGuest = token ? await guestOwnsMt5(token, botId) : false;
  }

  return NextResponse.json({
    paid: true,
    signedIn: !!user,
    owned,
    paidAsGuest,
    priceUsd: prod.priceUsd,
  });
}
