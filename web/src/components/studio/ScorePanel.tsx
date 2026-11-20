"use client";

import { useId } from "react";

import type { CopyChannel, CopyScore, CriterionScore, ScoreBand } from "@/lib/types";

const BAND: Record<ScoreBand, string> = { strong: "Strong", good: "Good", needs_work: "Needs work", weak: "Weak" };
const CHANNEL: Record<CopyChannel, string> = { linkedin: "LinkedIn", x: "X", article: "Article" };
const EVIDENCE: Record<CriterionScore["confidence"], string> = { high: "Strong evidence", medium: "Good evidence", low: "Limited evidence" };
const HOOK: Record<string, string> = {
  story: "a story",
  position: "a position",
  result: "a result",
  statement: "a statement",
  question: "a question",
  announcement: "an announcement",
  list: "a list",
  other: "something else",
};

/** Most valuable first: failures before warnings, then by weight × evidence. */
function rank(a: CriterionScore, b: CriterionScore): number {
  const w = { high: 1, medium: 0.75, low: 0.4 };
  return b.weight * w[b.confidence] - a.weight * w[a.confidence];
}

/**
 * Shows how closely copy follows the evidence-based rubric, what to fix first and why.
 * `onApply` revises the draft with one suggestion; `onApplyAll` applies every open suggestion in one rewrite.
 */
export function ScorePanel({
  score,
  scoring,
  onRescore,
  onApply,
  onApplyAll,
  disabled,
  emptyText,
}: {
  score: CopyScore | null | undefined;
  scoring: boolean;
  onRescore?: () => void;
  onApply?: (c: CriterionScore) => void;
  onApplyAll?: () => void;
  disabled?: boolean;
  emptyText: string;
}) {
  const id = useId();

  if (!score) {
    return scoring ? (
      <div className="score" aria-busy="true" aria-label="Scoring the draft">
        <div className="skeleton" style={{ height: 72, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 16, width: "70%", borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 16 }} />
      </div>
    ) : (
      <div className="score">
        <p className="form-note" style={{ color: "var(--muted)", margin: 0 }}>
          {emptyText}
        </p>
        {onRescore && (
          <button type="button" className="pill ghost sm" style={{ alignSelf: "flex-start" }} onClick={onRescore} disabled={disabled}>
            Score it
          </button>
        )}
      </div>
    );
  }

  const fails = score.criteria.filter((c) => c.status === "fail").sort(rank);
  const warns = score.criteria.filter((c) => c.status === "warn").sort(rank);
  const passes = score.criteria.filter((c) => c.status === "pass").sort(rank);
  const multi = score.channels.length > 1;
  const fixable = [...fails, ...warns].filter((c) => c.suggestion).length;
  // With one-at-a-time fixes on offer, "all" only earns its place when there's more than one.
  const showApplyAll = Boolean(onApplyAll) && fixable > 0 && (!onApply || fixable > 1);

  return (
    <div className="score" aria-busy={scoring || undefined}>
      <div className="score-head">
        <div className="score-total" data-band={score.band}>
          <span className="score-number" aria-hidden="true">
            {score.total}
          </span>
          <span className="sr-only">
            Score {score.total} out of 100, {BAND[score.band]}.
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <p className="score-band" data-band={score.band}>
            {BAND[score.band]}
          </p>
          {multi && (
            <p className="score-channels">
              {score.channels.map((c) => (
                <span key={c.channel}>
                  {CHANNEL[c.channel]} <strong>{c.score}</strong>
                </span>
              ))}
            </p>
          )}
          {score.revised && score.first_total !== null && <p className="score-meta">Improved automatically from {score.first_total}.</p>}
        </div>
      </div>

      {score.stale && (
        <div className="score-stale" role="status">
          <span>You&apos;ve edited since this was scored.</span>
          {onRescore && (
            <button type="button" className="pill ghost sm" onClick={onRescore} disabled={disabled || scoring}>
              {scoring ? "Scoring…" : "Rescore"}
            </button>
          )}
        </div>
      )}
      {!score.judged && (
        <p className="form-note" data-tone="error" style={{ margin: 0 }}>
          The AI judgement didn&apos;t respond, so this covers the rule checks only. Rescore in a moment.
        </p>
      )}
      {score.summary && score.judged && (
        <p className="score-summary">
          <strong>Biggest win: </strong>
          {score.summary}
        </p>
      )}

      {fails.length + warns.length > 0 ? (
        <>
          {showApplyAll && (
            <button type="button" className="pill sm" style={{ alignSelf: "flex-start" }} onClick={onApplyAll} disabled={disabled || scoring}>
              {`Apply all ${fixable} fixes`}
            </button>
          )}
          <CriteriaList title="Fix first" items={fails} multi={multi} onApply={onApply} disabled={disabled || scoring} />
          <CriteriaList title="Could be better" items={warns} multi={multi} onApply={onApply} disabled={disabled || scoring} />
        </>
      ) : (
        <p className="form-note" data-tone="success" style={{ margin: 0 }}>
          Every check passes.
        </p>
      )}

      {passes.length > 0 && (
        <details className="score-passes">
          <summary>What&apos;s working ({passes.length})</summary>
          <ul>
            {passes.map((c) => (
              <li key={`${c.channel}-${c.id}`}>
                {c.label}
                {multi && <span className="score-tag">{CHANNEL[c.channel]}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="score-foot" id={`${id}-foot`}>
        {onRescore && !score.stale && (
          <>
            <button type="button" className="link-button" onClick={onRescore} disabled={disabled || scoring}>
              {scoring ? "Scoring…" : "Rescore"}
            </button>
            {" · "}
          </>
        )}
        {score.hook_type && <>Opens with {HOOK[score.hook_type] ?? score.hook_type}. </>}
        Scores how closely the copy follows the evidence, not predicted reach.
      </p>
    </div>
  );
}

function CriteriaList({
  title,
  items,
  multi,
  onApply,
  disabled,
}: {
  title: string;
  items: CriterionScore[];
  multi: boolean;
  onApply?: (c: CriterionScore) => void;
  disabled?: boolean;
}) {
  const id = useId();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id} className="score-list">
      <h3 id={id}>{title}</h3>
      <ul>
        {items.map((c) => (
          <li key={`${c.channel}-${c.id}`} data-status={c.status}>
            <div className="score-item-head">
              <span className="score-item-label">{c.label}</span>
              {multi && <span className="score-tag">{CHANNEL[c.channel]}</span>}
              <span className="score-evidence" title={c.basis}>
                {EVIDENCE[c.confidence]}
              </span>
            </div>
            {c.quote && <q className="score-quote">{c.quote}</q>}
            <p className="score-tip">{c.suggestion || c.note}</p>
            <details className="score-why">
              <summary>Why this matters</summary>
              <p>{c.basis}</p>
            </details>
            {onApply && c.suggestion && (
              <button type="button" className="pill light sm" style={{ alignSelf: "flex-start" }} onClick={() => onApply(c)} disabled={disabled}>
                Apply this fix
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
