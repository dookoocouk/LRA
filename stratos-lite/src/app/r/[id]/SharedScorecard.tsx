"use client";

import { Scorecard } from "@/components/Scorecard";
import type { AuditResult } from "@/lib/schema";

export function SharedScorecard({
  decision,
  result,
}: {
  decision: string;
  result: AuditResult;
}) {
  return <Scorecard decision={decision} result={result} />;
}
