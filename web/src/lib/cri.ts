/**
 * Calibrated Reliance Instrument, framework version 1.0, as specified in the paper.
 *
 * Pure functions with no imports, so they run in the browser and under `node --test` unchanged.
 * Warranted oversight (W) comes from nine yes/no task factors; applied oversight (A) from five
 * observable signals; the reliance gap is G = L(W) − L(A).
 */

export const FRAMEWORK_VERSION = "1.0";

export interface Factor {
  id: string;
  /** Phrased so that "yes" (checked) is the higher-oversight answer. */
  label: string;
}
export interface Dimension {
  id: string;
  name: string;
  weight: number;
  factors: Factor[];
}

export const DIMENSIONS: Dimension[] = [
  {
    id: "consequence",
    name: "Consequence and recoverability",
    weight: 0.2,
    factors: [
      { id: "severity", label: "An error could cause serious harm" },
      { id: "reversibility", label: "A mistake would be hard to undo once the output is used" },
    ],
  },
  {
    id: "verification_demand",
    name: "Verification demand",
    weight: 0.2,
    factors: [
      { id: "checking_effort", label: "Checking the answer takes real effort" },
      { id: "evidence", label: "There's no authoritative evidence to check it against" },
    ],
  },
  {
    id: "model_task_evidence",
    name: "Model-task evidence",
    weight: 0.2,
    factors: [{ id: "model_performance", label: "There's little or no evidence of how the model performs on this task" }],
  },
  {
    id: "verification_capability",
    name: "Verification capability",
    weight: 0.2,
    factors: [
      { id: "knowledge", label: "The person lacks the knowledge this task needs" },
      { id: "method", label: "There's no independent way to check the output" },
    ],
  },
  {
    id: "responsibility",
    name: "Responsibility and exposure",
    weight: 0.2,
    factors: [
      { id: "responsibility", label: "The person carries real responsibility for the result" },
      { id: "exposure", label: "A mistake could affect people beyond this conversation" },
    ],
  },
];

export const FACTOR_IDS: string[] = DIMENSIONS.flatMap((d) => d.factors.map((f) => f.id));

export interface Signal {
  id: string;
  name: string;
  detail: string;
  weight: number;
}

export const SIGNALS: Signal[] = [
  { id: "verification", name: "Independent verification", detail: "Recorded a check against a source or method outside the AI's answer", weight: 0.4 },
  { id: "edited", name: "Output edited", detail: "Submitted text differs from what the AI produced", weight: 0.2 },
  { id: "deliberation", name: "Deliberation", detail: "Took 15 seconds or more before deciding", weight: 0.15 },
  { id: "override", name: "Override or regenerate", detail: "Rejected the answer or asked for another", weight: 0.15 },
  { id: "reasoning", name: "Reasoning opened", detail: "Opened the AI's explanation", weight: 0.1 },
];

export const LEVELS = ["L0", "L1", "L2", "L3", "L4"] as const;
export type Level = 0 | 1 | 2 | 3 | 4;
/** Lower edges of L1–L4. Bands are half-open; the top band includes 1.0. */
export const BAND_EDGES = [0.2, 0.4, 0.6, 0.8] as const;

/** Floating-point sums can land a hair below an edge (0.6 → 0.5999…); the paper's fix rounds first. */
function round10(x: number): number {
  return Math.round(x * 1e10) / 1e10;
}

export function levelOf(score: number): Level {
  const s = round10(score);
  let level = 0;
  for (const edge of BAND_EDGES) if (s >= edge) level += 1;
  return level as Level;
}

export interface DimensionResult {
  id: string;
  name: string;
  score: number;
  weight: number;
  contribution: number;
}
export interface WarrantedResult {
  score: number;
  level: Level;
  dimensions: DimensionResult[];
}

/** Warranted oversight. `high` holds the ids of factors answered "yes". */
export function warranted(high: ReadonlySet<string>): WarrantedResult {
  const total = DIMENSIONS.reduce((sum, d) => sum + (d.weight > 0 ? d.weight : 0), 0);
  const dimensions = DIMENSIONS.map((d) => {
    const score = d.factors.filter((f) => high.has(f.id)).length / d.factors.length;
    const weight = d.weight > 0 ? d.weight / total : 0;
    return { id: d.id, name: d.name, score, weight, contribution: weight * score };
  });
  const score = round10(dimensions.reduce((sum, d) => sum + d.contribution, 0));
  return { score, level: levelOf(score), dimensions };
}

export type SignalState = "done" | "not_done" | "unavailable";

export interface AppliedResult {
  /** null when no signal could be observed: undefined, not zero. */
  score: number | null;
  level: Level | null;
  coverage: number;
}

/** Applied oversight: A = Σ(w·m·x) / Σ(w·m), coverage C = Σ(w·m). */
export function applied(states: Readonly<Record<string, SignalState>>): AppliedResult {
  let observed = 0;
  let credited = 0;
  for (const s of SIGNALS) {
    const state = states[s.id] ?? "not_done";
    if (state === "unavailable") continue;
    observed += s.weight;
    if (state === "done") credited += s.weight;
  }
  const coverage = round10(observed);
  if (coverage === 0) return { score: null, level: null, coverage: 0 };
  const score = round10(credited / observed);
  return { score, level: levelOf(score), coverage };
}

/** Signed ordinal gap. Positive: recorded checking fell short of what the task warranted. */
export function gap(w: WarrantedResult, a: AppliedResult): number | null {
  return a.level === null ? null : w.level - a.level;
}

// ── Compact state for shareable links: 9 factor bits + 5 signal states, e.g. "100000000.dnnnu" ──

const STATE_CODE: Record<SignalState, string> = { done: "d", not_done: "n", unavailable: "u" };
const CODE_STATE: Record<string, SignalState> = { d: "done", n: "not_done", u: "unavailable" };

export function encodeState(high: ReadonlySet<string>, states: Readonly<Record<string, SignalState>>): string {
  const w = FACTOR_IDS.map((id) => (high.has(id) ? "1" : "0")).join("");
  const a = SIGNALS.map((s) => STATE_CODE[states[s.id] ?? "not_done"]).join("");
  return `${w}.${a}`;
}

/** Returns null for anything malformed, so a mangled link falls back to the defaults. */
export function decodeState(raw: string | null | undefined): { high: Set<string>; states: Record<string, SignalState> } | null {
  const m = raw ? /^([01]{9})\.([dnu]{5})$/.exec(raw) : null;
  if (!m) return null;
  const high = new Set(FACTOR_IDS.filter((_, i) => m[1][i] === "1"));
  const states: Record<string, SignalState> = {};
  SIGNALS.forEach((s, i) => {
    states[s.id] = CODE_STATE[m[2][i]];
  });
  return { high, states };
}
