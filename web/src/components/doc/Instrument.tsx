"use client";

import { useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";

import {
  DIMENSIONS,
  FRAMEWORK_VERSION,
  LEVELS,
  SIGNALS,
  applied,
  decodeState,
  encodeState,
  gap,
  warranted,
  type Level,
  type SignalState,
} from "@/lib/cri";

const PARAM = "cri";

const NONE_DONE: Record<string, SignalState> = Object.fromEntries(SIGNALS.map((s) => [s.id, "not_done"]));

const TASK_PRESETS: { label: string; high: string[] }[] = [
  { label: "Low-stakes draft", high: [] },
  { label: "One severe risk", high: ["severity"] },
  { label: "High stakes, hard to check", high: ["severity", "reversibility", "checking_effort", "evidence", "method", "responsibility", "exposure"] },
];
const ACTION_PRESETS: { label: string; states: Record<string, SignalState> }[] = [
  { label: "Quick accept", states: NONE_DONE },
  { label: "Edited and checked", states: { ...NONE_DONE, verification: "done", edited: "done", deliberation: "done" } },
  { label: "Checked, but checks not visible", states: { ...NONE_DONE, verification: "unavailable", edited: "done", deliberation: "done" } },
];

const STATE_LABEL: Record<SignalState, string> = { done: "Did it", not_done: "Didn't", unavailable: "Can't observe" };

const fmt = (n: number) => n.toFixed(2);

function gapSentence(g: number | null): string {
  if (g === null) return "No signal could be observed, so applied oversight and the gap are undefined rather than zero.";
  if (g > 0) return `Recorded checking fell ${g} level${g === 1 ? "" : "s"} short of what the task warranted.`;
  if (g < 0) return `More checking was recorded than the task level required (by ${-g}). That isn't necessarily wasted effort.`;
  return "Recorded checking matches the level the task warranted. The same result can come from very different tasks and behaviours.";
}

/**
 * The paper's version 1.0 rules, running in the browser. Choices live in the `?cri=` query string so a result
 * can be shared; nothing is sent anywhere.
 */
export function Instrument({ title, intro }: { title: string; intro: string }) {
  const params = useSearchParams();
  const initial = useMemo(() => decodeState(params.get(PARAM)), [params]);
  const [high, setHigh] = useState<Set<string>>(() => initial?.high ?? new Set());
  const [states, setStates] = useState<Record<string, SignalState>>(() => initial?.states ?? NONE_DONE);
  const [copyStatus, setCopyStatus] = useState("");
  const uid = useId();

  const w = warranted(high);
  const a = applied(states);
  const g = gap(w, a);

  function commit(nextHigh: Set<string>, nextStates: Record<string, SignalState>) {
    setHigh(nextHigh);
    setStates(nextStates);
    setCopyStatus("");
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM, encodeState(nextHigh, nextStates));
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }

  function toggleFactor(id: string, on: boolean) {
    const next = new Set(high);
    if (on) next.add(id);
    else next.delete(id);
    commit(next, states);
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM, encodeState(high, states));
    url.hash = "instrument";
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopyStatus("Link copied. It opens with these choices.");
    } catch {
      setCopyStatus("Couldn't copy automatically. Copy the address from your browser's address bar instead.");
    }
  }

  const severeButLow = high.has("severity") && w.level <= 1;
  const sameAsPreset = (p: string[]) => p.length === high.size && p.every((id) => high.has(id));
  const sameStates = (s: Record<string, SignalState>) => SIGNALS.every((sig) => s[sig.id] === states[sig.id]);

  return (
    <section className="doc-block cri" id="instrument" aria-labelledby={`${uid}-title`}>
      <header className="cri-head">
        <p className="cri-kicker">Interactive · framework v{FRAMEWORK_VERSION}</p>
        <h3 id={`${uid}-title`} className="cri-title">
          {title}
        </h3>
        {intro && <p className="cri-intro">{intro}</p>}
      </header>

      {/* 1. The task */}
      <div className="cri-part">
        <div className="cri-part-head">
          <h4>1. Describe the task</h4>
          <div className="cri-presets" role="group" aria-label="Example tasks">
            {TASK_PRESETS.map((p) => (
              <button key={p.label} type="button" className="cri-chip" aria-pressed={sameAsPreset(p.high)} onClick={() => commit(new Set(p.high), states)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cri-dims">
          {DIMENSIONS.map((d, i) => {
            const r = w.dimensions[i];
            return (
              <fieldset key={d.id} className="cri-dim">
                <legend>
                  <span>{d.name}</span>
                  <span className="cri-contrib" aria-label={`contributes ${fmt(r.contribution)} of ${fmt(r.weight)}`}>
                    +{fmt(r.contribution)}
                  </span>
                </legend>
                {d.factors.map((f) => (
                  <label key={f.id} className="check-label cri-factor">
                    <input type="checkbox" className="checkbox" checked={high.has(f.id)} onChange={(e) => toggleFactor(f.id, e.target.checked)} />
                    <span>{f.label}</span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>

        <div className="cri-score">
          <div>
            <p className="cri-score-label">Warranted oversight (W)</p>
            <p className="cri-score-value">
              {LEVELS[w.level]} <span>score {fmt(w.score)}</span>
            </p>
          </div>
          <LevelMeter level={w.level} label="Warranted level" />
        </div>
        {severeButLow && (
          <p className="cri-note" role="note">
            A severe consequence on its own barely moves the total under version 1.0. That&apos;s the open issue the paper flags: version 1.1 will test a minimum level for conditions like this.
          </p>
        )}
      </div>

      {/* 2. The behaviour */}
      <div className="cri-part">
        <div className="cri-part-head">
          <h4>2. What the person did</h4>
          <div className="cri-presets" role="group" aria-label="Example behaviour">
            {ACTION_PRESETS.map((p) => (
              <button key={p.label} type="button" className="cri-chip" aria-pressed={sameStates(p.states)} onClick={() => commit(high, p.states)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cri-signals">
          {SIGNALS.map((s) => (
            <fieldset key={s.id} className="cri-signal">
              <legend>
                <span className="cri-signal-name">{s.name}</span>
                <span className="cri-weight">weight {s.weight.toFixed(2)}</span>
              </legend>
              <p className="cri-signal-detail">{s.detail}</p>
              <div className="cri-seg">
                {(Object.keys(STATE_LABEL) as SignalState[]).map((state) => (
                  <label key={state}>
                    <input type="radio" name={`${uid}-${s.id}`} value={state} checked={states[s.id] === state} onChange={() => commit(high, { ...states, [s.id]: state })} />
                    <span>{STATE_LABEL[state]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="cri-score">
          <div>
            <p className="cri-score-label">Applied oversight (A)</p>
            <p className="cri-score-value">
              {a.level === null ? "Undefined" : LEVELS[a.level]} {a.score !== null && <span>score {fmt(a.score)}</span>}
            </p>
            <p className="cri-coverage">
              Coverage {fmt(a.coverage)}
              {a.coverage < 1 && a.coverage > 0 && " · built from fewer signals, so compare with care"}
            </p>
          </div>
          {a.level !== null && <LevelMeter level={a.level} label="Applied level" />}
        </div>
      </div>

      {/* 3. The gap */}
      <div className="cri-result" aria-live="polite" aria-atomic="true">
        <p className="cri-score-label">Reliance gap · G = L(W) − L(A)</p>
        <p className="cri-gap">
          {g === null ? "—" : g > 0 ? `+${g}` : g}
          <span className="sr-only">. </span>
        </p>
        <p className="cri-gap-text">{gapSentence(g)}</p>
        <div className="cri-actions">
          <button type="button" className="pill light sm" onClick={copyLink}>
            Copy link to this result
          </button>
          <button type="button" className="pill ghost-light sm" onClick={() => commit(new Set(), NONE_DONE)}>
            Reset
          </button>
        </div>
        <p className="cri-copy-status" role="status">
          {copyStatus}
        </p>
      </div>

      <p className="cri-footnote">
        This runs the paper&apos;s version 1.0 rules in your browser; nothing you choose is sent anywhere. The weights and bands are design choices, not validated values, and the gap describes the rule, not whether a decision was right.
      </p>
    </section>
  );
}

function LevelMeter({ level, label }: { level: Level; label: string }) {
  return (
    <ol className="cri-meter" aria-label={`${label}: ${LEVELS[level]} of L0 to L4`}>
      {LEVELS.map((l, i) => (
        <li key={l} className={i === level ? "on" : i < level ? "below" : undefined} aria-current={i === level ? "true" : undefined}>
          {l}
        </li>
      ))}
    </ol>
  );
}

/** Server-rendered placeholder while the instrument hydrates (it reads the share link from the URL). */
export function InstrumentSkeleton({ title }: { title: string }) {
  return (
    <section className="doc-block cri cri-skeleton" aria-busy="true" aria-label={title}>
      <div className="cri-head">
        <h3 className="cri-title">{title}</h3>
      </div>
      <div className="skeleton" style={{ height: 520, borderRadius: 20 }} />
    </section>
  );
}
