"use client";

import type { AuditResult } from "@/lib/schema";
import { Accordion } from "./Accordion";
import { ShareButtons } from "./ShareButtons";

const verdictColor: Record<string, string> = {
  Proceed: "text-green-600",
  "Proceed with Caution": "text-yellow-600",
  "Test First": "text-amber-500",
  "High Risk": "text-red-600",
};

const verdictBg: Record<string, string> = {
  Proceed: "bg-green-50 border-green-200",
  "Proceed with Caution": "bg-yellow-50 border-yellow-200",
  "Test First": "bg-amber-50 border-amber-200",
  "High Risk": "bg-red-50 border-red-200",
};

export function Scorecard({
  decision,
  result,
}: {
  decision: string;
  result: AuditResult;
}) {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Verdict Banner */}
      <div
        className={`rounded-lg border p-6 text-center ${verdictBg[result.verdict] ?? "bg-gray-50 border-gray-200"}`}
      >
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
          Verdict
        </p>
        <p
          className={`text-3xl font-bold ${verdictColor[result.verdict] ?? "text-gray-900"}`}
        >
          {result.verdict}
        </p>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-semibold">Confidence: {result.confidence_score}/100</span>
          {" — "}
          {result.confidence_reason}
        </p>
      </div>

      {/* Scorecard Fields */}
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        <Field label="Decision Type" value={result.decision_type} />
        <Field label="Biggest Risk" value={result.biggest_risk} />
        <Field label="Hidden Assumption" value={result.hidden_assumption} />
        <Field label="Better Question" value={result.better_question} />
        <Field label="30-Day Test" value={result.thirty_day_test} />
        <Field
          label="Devil's Argument"
          value={result.devils_argument}
        />
      </div>

      {/* Expandable Details */}
      <div className="space-y-2">
        <Accordion title="Assumptions" items={result.assumptions} />
        <Accordion
          title="Risks & Blind Spots"
          items={result.risks_blind_spots}
        />
        <Accordion
          title="Information Needed"
          items={result.information_needed}
        />
      </div>

      {/* Share */}
      <ShareButtons decision={decision} result={result} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-start gap-1">
      <span className="text-xs uppercase tracking-widest text-gray-400 sm:w-40 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}
