"use client";

import Link from "next/link";
import { useId } from "react";

import type { ChannelResult, Experiment, PostResults } from "@/lib/types";

type Field = keyof ChannelResult;

const MAIN: { key: Field; label: string; x?: string }[] = [
  { key: "impressions", label: "Impressions" },
  { key: "reactions", label: "Reactions", x: "Likes" },
  { key: "comments", label: "Comments", x: "Replies" },
  { key: "reposts", label: "Reposts", x: "Reposts and quotes" },
  { key: "shares", label: "Sends", x: "Shares" },
  { key: "saves", label: "Saves", x: "Bookmarks" },
  { key: "negatives", label: "Negatives" },
];
const MORE: { key: Field; label: string }[] = [
  { key: "profile_visits", label: "Profile visits" },
  { key: "link_clicks", label: "Link clicks" },
  { key: "follows", label: "New followers" },
];

const EMPTY_CHANNEL: ChannelResult = {
  impressions: null,
  reactions: null,
  comments: null,
  reposts: null,
  shares: null,
  saves: null,
  profile_visits: null,
  link_clicks: null,
  follows: null,
  negatives: null,
};

export const EMPTY_RESULTS: PostResults = { linkedin: null, x: null, inquiries: 0, measured_at: null, notes: "" };

/** Comments, reposts, sends and saves per 100 impressions: what both feeds rank on, and what Results compares. */
export function conversationRate(r: ChannelResult | null): number | null {
  if (!r || !r.impressions) return null;
  const talk = (r.comments ?? 0) + (r.reposts ?? 0) + (r.shares ?? 0) + (r.saves ?? 0);
  return (100 * talk) / r.impressions;
}

function parseCount(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** What a posted post actually did, plus which experiment it belongs to. */
export function ResultsPanel({
  results,
  onChange,
  experiments,
  experimentId,
  arm,
  onExperiment,
  hasLinkedin,
  hasX,
  posted,
  errorField,
}: {
  results: PostResults | null | undefined;
  onChange: (r: PostResults) => void;
  experiments: Experiment[];
  experimentId: string | null | undefined;
  arm: string;
  onExperiment: (id: string | null, arm: string) => void;
  hasLinkedin: boolean;
  hasX: boolean;
  posted: boolean;
  errorField: string | null;
}) {
  const id = useId();
  const r = results ?? EMPTY_RESULTS;
  const running = experiments.filter((e) => e.status === "running" || e.id === experimentId);
  const exp = experiments.find((e) => e.id === experimentId) ?? null;

  function setChannel(ch: "linkedin" | "x", key: Field, value: number | null) {
    const current = r[ch] ?? EMPTY_CHANNEL;
    const next = { ...current, [key]: value };
    const empty = Object.values(next).every((v) => v === null);
    onChange({ ...r, [ch]: empty ? null : next });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!posted && (
        <p className="form-note" style={{ color: "var(--muted)", margin: 0 }}>
          Mark the post as posted, then come back about a week later and copy the numbers from LinkedIn and X analytics.
        </p>
      )}

      <div className="results-experiment">
        <div className="field">
          <label htmlFor={`${id}-exp`}>Experiment</label>
          <select
            id={`${id}-exp`}
            className="input"
            value={experimentId ?? ""}
            onChange={(e) => {
              const next = experiments.find((x) => x.id === e.target.value) ?? null;
              onExperiment(next?.id ?? null, next?.arms[0] ?? "");
            }}
          >
            <option value="">Not part of an experiment</option>
            {running.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.status === "concluded" ? " (concluded)" : ""}
              </option>
            ))}
          </select>
        </div>
        {exp && (
          <div className="field">
            <label htmlFor={`${id}-arm`}>Arm</label>
            <select id={`${id}-arm`} className="input" value={arm} onChange={(e) => onExperiment(exp.id, e.target.value)} aria-invalid={errorField === "arm" ? true : undefined}>
              {exp.arms.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {exp?.variable && (
        <p className="form-note" style={{ color: "var(--muted)", margin: 0 }}>
          Testing: {exp.variable}. Change only that between arms; keep topic, timing and length alike.
        </p>
      )}
      {experiments.length === 0 && (
        <p className="form-note" style={{ color: "var(--muted)", margin: 0 }}>
          <Link href="/studio/results#experiments">Start an experiment</Link> to compare one change at a time, such as short against long hooks.
        </p>
      )}

      {(["linkedin", "x"] as const).map((ch) => {
        const show = ch === "linkedin" ? hasLinkedin || r.linkedin : hasX || r.x;
        if (!show) return null;
        const values = r[ch] ?? EMPTY_CHANNEL;
        const rateNow = conversationRate(r[ch]);
        return (
          <fieldset key={ch} className="results-channel">
            <legend>{ch === "linkedin" ? "LinkedIn" : "X"}</legend>
            <div className="results-grid">
              {MAIN.map((f) => (
                <CountField key={f.key} id={`${id}-${ch}-${f.key}`} label={ch === "x" && f.x ? f.x : f.label} value={values[f.key]} onChange={(v) => setChannel(ch, f.key, v)} invalid={errorField === `results.${ch}.${f.key}`} />
              ))}
            </div>
            <details className="results-more">
              <summary>More numbers</summary>
              <div className="results-grid">
                {MORE.map((f) => (
                  <CountField key={f.key} id={`${id}-${ch}-${f.key}`} label={f.label} value={values[f.key]} onChange={(v) => setChannel(ch, f.key, v)} invalid={errorField === `results.${ch}.${f.key}`} />
                ))}
              </div>
            </details>
            <p className="results-rate" aria-live="polite">
              {rateNow === null ? "Add impressions to see the conversation rate." : `Conversation rate: ${rateNow.toFixed(2)} per 100 impressions.`}
            </p>
          </fieldset>
        );
      })}

      <div className="results-grid">
        <CountField id={`${id}-inq`} label="Enquiries from this post" value={r.inquiries} onChange={(v) => onChange({ ...r, inquiries: v ?? 0 })} invalid={errorField === "results.inquiries"} />
        <div className="field">
          <label htmlFor={`${id}-date`}>Measured on</label>
          <input id={`${id}-date`} className="input" type="date" value={r.measured_at ?? ""} onChange={(e) => onChange({ ...r, measured_at: e.target.value || null })} aria-invalid={errorField === "results.measured_at" ? true : undefined} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-notes`}>Notes</label>
        <textarea id={`${id}-notes`} className="input" rows={2} maxLength={600} value={r.notes} onChange={(e) => onChange({ ...r, notes: e.target.value })} placeholder="Anything unusual: a big account reshared it, posted on a bank holiday…" />
      </div>
      <p className="form-note" style={{ color: "var(--muted)", margin: 0 }}>
        Negatives are anything you can count against the post: unfollows, hides, &ldquo;not interested&rdquo; or hostile replies. Enquiries are messages or leads you can trace back to it.
      </p>
    </div>
  );
}

function CountField({ id, label, value, onChange, invalid }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void; invalid?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value ?? ""}
        onChange={(e) => onChange(parseCount(e.target.value))}
        aria-invalid={invalid ? true : undefined}
      />
    </div>
  );
}
