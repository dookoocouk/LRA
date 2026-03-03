import { NextRequest, NextResponse } from "next/server";
import { generatePdf } from "@/lib/pdf";
import { AuditResultSchema } from "@/lib/schema";

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

  const parsed = AuditResultSchema.safeParse(body.result);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid result data." }, { status: 400 });
  }

  const pdfBytes = await generatePdf(body.decision, parsed.data);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="stratos-lite-audit.pdf"',
    },
  });
}
