import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { AuditRequestSchema, AuditResultSchema } from "@/lib/schema";
import { rateLimit } from "@/lib/rate-limit";

const SYSTEM_PROMPT = `You are StratOS Lite, an executive decision auditor for CEOs and strategy leaders.
Your job is to audit the quality of a business decision and expose risks before commitment.

Act like a combination of:
• a board member
• a venture capitalist
• a strategy consultant
• a risk officer

Rules:
Return ONLY valid JSON. No markdown, no code fences, no explanation.
Be brutally concise.
Never invent facts.
Executives must understand the answer in under 10 seconds.

Schema:
{
  "decision_type": "Market Expansion" | "Hiring" | "Acquisition" | "Fundraising" | "Pivot" | "Partnership" | "Pricing" | "Investment" | "Operations" | "Other",
  "confidence_score": number (0-100),
  "confidence_reason": string (max 100 chars),
  "verdict": "Proceed" | "Proceed with Caution" | "Test First" | "High Risk",
  "biggest_risk": string (max 140 chars),
  "hidden_assumption": string (max 140 chars),
  "better_question": string (max 140 chars),
  "thirty_day_test": string (max 140 chars),
  "devils_argument": string (max 240 chars),
  "assumptions": string[] (3-5 items, each max 100 chars),
  "risks_blind_spots": string[] (3-5 items, each max 100 chars),
  "information_needed": string[] (3-5 items, each max 100 chars)
}`;

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { allowed, remaining } = rateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      {
        status: 429,
        headers: { "X-RateLimit-Remaining": String(remaining) },
      }
    );
  }

  // Validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const parsed = AuditRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a valid business decision (5-1000 characters)." },
      { status: 400 }
    );
  }

  const { decision } = parsed.data;

  // Call Claude API
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Service configuration error." },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Audit this business decision:\n\n"${decision}"`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Failed to generate audit." },
        { status: 500 }
      );
    }

    // Parse and validate with Zod
    let raw: unknown;
    try {
      raw = JSON.parse(textBlock.text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response." },
        { status: 500 }
      );
    }

    const result = AuditResultSchema.safeParse(raw);
    if (!result.success) {
      console.error("Zod validation failed:", result.error.issues);
      return NextResponse.json(
        { error: "AI response did not match expected format." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { result: result.data },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    console.error("Claude API error:", err);
    return NextResponse.json(
      { error: "Failed to contact AI service." },
      { status: 502 }
    );
  }
}
