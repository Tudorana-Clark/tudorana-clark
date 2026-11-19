import type { Metadata } from "next";
import { connection } from "next/server";

import { ResultsDashboard } from "@/components/studio/ResultsDashboard";
import { ApiError, studio } from "@/lib/api";
import type { Experiment, ResultsSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsPage() {
  await connection();
  let summary: ResultsSummary | null = null;
  let experiments: Experiment[] = [];
  let error: string | null = null;
  try {
    [summary, experiments] = await Promise.all([studio.results(), studio.experiments()]);
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Your results couldn’t load. Please try again.";
  }
  return <ResultsDashboard summary={summary} experiments={experiments} loadError={error} />;
}
