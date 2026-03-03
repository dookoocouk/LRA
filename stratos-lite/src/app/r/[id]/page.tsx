import { getAudit } from "@/lib/store";
import { notFound } from "next/navigation";
import { SharedScorecard } from "./SharedScorecard";

export default async function SharedResultPage({
  params,
}: {
  params: { id: string };
}) {
  const audit = await getAudit(params.id);
  if (!audit) return notFound();

  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400 mb-1">
            London Royal Academy
          </p>
          <h1 className="text-lg font-semibold text-gray-900">
            StratOS Lite
          </h1>
          <p className="text-sm text-gray-500 mt-2">Shared Decision Audit</p>
        </div>

        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">
            Decision
          </p>
          <p className="text-sm text-gray-900">{audit.decision}</p>
        </div>

        <SharedScorecard decision={audit.decision} result={audit.result} />
      </div>

      <footer className="mt-12 text-center">
        <p className="text-[10px] text-gray-400">
          Supports decision thinking. Not legal or financial advice.
        </p>
      </footer>
    </main>
  );
}
