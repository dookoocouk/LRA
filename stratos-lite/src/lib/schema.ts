import { z } from "zod";

export const DecisionTypes = [
  "Market Expansion",
  "Hiring",
  "Acquisition",
  "Fundraising",
  "Pivot",
  "Partnership",
  "Pricing",
  "Investment",
  "Operations",
  "Other",
] as const;

export const Verdicts = [
  "Proceed",
  "Proceed with Caution",
  "Test First",
  "High Risk",
] as const;

export const AuditResultSchema = z.object({
  decision_type: z.enum(DecisionTypes),
  confidence_score: z.number().min(0).max(100),
  confidence_reason: z.string(),
  verdict: z.enum(Verdicts),
  biggest_risk: z.string().max(280),
  hidden_assumption: z.string().max(280),
  better_question: z.string().max(280),
  thirty_day_test: z.string().max(280),
  devils_argument: z.string().max(480),
  assumptions: z.array(z.string()),
  risks_blind_spots: z.array(z.string()),
  information_needed: z.array(z.string()),
});

export type AuditResult = z.infer<typeof AuditResultSchema>;

export const AuditRequestSchema = z.object({
  decision: z.string().min(5).max(1000),
});

export type AuditRequest = z.infer<typeof AuditRequestSchema>;

export interface StoredAudit {
  decision: string;
  result: AuditResult;
  createdAt: string;
}
