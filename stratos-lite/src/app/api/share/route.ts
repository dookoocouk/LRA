import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { storeAudit } from "@/lib/store";
import type { StoredAudit } from "@/lib/schema";

export async function POST(request: NextRequest) {
  let body: { decision: string; result: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.decision || !body.result) {
    return NextResponse.json({ error: "Missing data." }, { status: 400 });
  }

  const id = nanoid(8);
  const stored: StoredAudit = {
    decision: body.decision,
    result: body.result as StoredAudit["result"],
    createdAt: new Date().toISOString(),
  };

  await storeAudit(id, stored);

  return NextResponse.json({ id, url: `/r/${id}` });
}
