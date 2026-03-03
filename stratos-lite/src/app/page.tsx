"use client";

import { useState } from "react";
import { Scorecard } from "@/components/Scorecard";
import type { AuditResult } from "@/lib/schema";

export default function Home() {
  const [decision, setDecision] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleAudit = async () => {
    if (decision.trim().length < 5) {
      setError("Please describe your decision in at least a few words.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decision.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setResult(data.result);
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setDecision("");
    setResult(null);
    setSubmitted(false);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-between px-4">
      {!submitted ? (
        /* INPUT SCREEN */
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400 mb-1">
            London Royal Academy
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 tracking-tight">
            StratOS Lite
          </h1>
          <div className="w-8 h-px bg-[#b8a260] mb-8" />
          <h2 className="text-base sm:text-lg text-gray-700 text-center mb-8 max-w-lg leading-relaxed">
            What&rsquo;s the most important business decision you&rsquo;re
            facing right now?
          </h2>
          <textarea
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="Should we expand into the UAE market next year?"
            rows={4}
            maxLength={1000}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base
              text-gray-900 placeholder:text-gray-400 resize-none
              focus:outline-none focus:ring-2 focus:ring-[#b8a260] focus:border-transparent
              transition-shadow"
          />
          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
          <button
            onClick={handleAudit}
            disabled={loading}
            className="mt-6 w-full sm:w-auto px-8 py-3 bg-gray-900 text-white text-sm
              uppercase tracking-wider rounded-lg
              hover:bg-black transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner />
                Auditing…
              </>
            ) : (
              "Audit My Decision"
            )}
          </button>
        </div>
      ) : (
        /* RESULT SCREEN */
        <div className="flex-1 w-full max-w-2xl py-12">
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-[0.25em] text-gray-400 mb-1">
              London Royal Academy
            </p>
            <h1 className="text-lg font-semibold text-gray-900">
              StratOS Lite
            </h1>
          </div>

          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">
              Decision
            </p>
            <p className="text-sm text-gray-900">{decision}</p>
          </div>

          {result && <Scorecard decision={decision} result={result} />}

          <div className="text-center mt-8">
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 hover:text-gray-900 underline underline-offset-4
                transition-colors"
            >
              Audit another decision
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-[10px] text-gray-400">
          Supports decision thinking. Not legal or financial advice.
        </p>
      </footer>
    </main>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-75"
      />
    </svg>
  );
}
