"use client";

import { useState } from "react";

import { reviseContentAction, scoreContentAction } from "@/app/studio/content-score-actions";
import { writePostAction } from "@/app/studio/studio-actions";
import type { ContentRevision, ContentScores, CopyScore, CriterionScore, Kind } from "@/lib/types";

import { ScorePanel } from "./ScorePanel";

type Tab = "piece" | "social";
type Snapshot = { title: string; body: string; linkedin: string; x: string };
type Notify = (tone: "success" | "error", text: string) => void;

/**
 * The copy engine for anything in Content: scores the piece (with checks that fit its kind) and its LinkedIn and X
 * posts, applies the body suggestions as a rewrite for review, and fixes social posts one suggestion at a time.
 */
export function ContentScorePanel({
  contentId,
  kind,
  title,
  body,
  excerpt,
  linkedin,
  x,
  initial,
  disabled,
  onRevision,
  onSocial,
  notify,
}: {
  contentId: string | null;
  kind: Kind;
  title: string;
  body: string;
  excerpt: string;
  linkedin: string;
  x: string;
  initial: ContentScores | null;
  disabled: boolean;
  onRevision: (r: ContentRevision) => void;
  onSocial: (copy: { linkedin: string; x: string }) => void;
  notify: Notify;
}) {
  const [scores, setScores] = useState<ContentScores | null>(initial);
  // The text each score was taken on. A stored score that was already out of date when the page loaded has none,
  // so it stays marked stale until it's rescored.
  const [bodySnap, setBodySnap] = useState<Pick<Snapshot, "title" | "body"> | null>(initial && !initial.body.stale ? { title, body } : null);
  const [socialSnap, setSocialSnap] = useState<Pick<Snapshot, "linkedin" | "x"> | null>(initial?.social && !initial.social.stale ? { linkedin, x } : null);
  const [busy, setBusy] = useState<null | "score" | "revise" | "social">(null);
  const [tab, setTab] = useState<Tab>("piece");

  const hasBody = Boolean(body.trim());
  const hasSocial = Boolean(linkedin.trim() || x.trim());
  const bodyStale = !bodySnap || bodySnap.title !== title || bodySnap.body !== body;
  const socialStale = !socialSnap || socialSnap.linkedin !== linkedin || socialSnap.x !== x;
  const bodyScore: CopyScore | null = scores ? { ...scores.body, stale: bodyStale } : null;
  const socialScore: CopyScore | null = scores?.social ? { ...scores.social, stale: socialStale } : null;

  async function score() {
    setBusy("score");
    try {
      const res = await scoreContentAction({ content_id: contentId, kind, title, body, linkedin, x });
      if (!res.ok) return notify("error", res.error);
      setScores(res.data);
      setBodySnap({ title, body });
      setSocialSnap(res.data.social ? { linkedin, x } : null);
      notify("success", res.message ?? "Scored.");
    } catch {
      notify("error", "We couldn’t reach the studio server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function applyBody() {
    if (!contentId) return notify("error", "Save the piece first, then apply the suggestions.");
    setBusy("revise");
    try {
      const res = await reviseContentAction(contentId, { kind, title, body });
      if (!res.ok) return notify("error", res.error);
      onRevision(res.data);
      notify("success", res.message ?? "Suggestions applied. Review, then save.");
    } catch {
      notify("error", "We couldn’t reach the studio server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function applySocial(c: CriterionScore) {
    setBusy("social");
    try {
      const where = c.channel === "x" ? "In the X post: " : "In the LinkedIn post: ";
      const res = await writePostAction({
        seed: (excerpt || title || "This piece").slice(0, 2000),
        source_id: contentId,
        current: { linkedin, x, hook: "" },
        instruction: `${where}${c.suggestion}`.slice(0, 300),
      });
      if (!res.ok) return notify("error", res.error);
      onSocial({ linkedin: res.data.linkedin, x: res.data.x });
      setScores((s) => (s ? { ...s, social: res.data.score } : s));
      setSocialSnap({ linkedin: res.data.linkedin, x: res.data.x });
      notify("success", `${c.channel === "x" ? "X" : "LinkedIn"} post revised. It now scores ${res.data.score.total}. Review, then save.`);
    } catch {
      notify("error", "We couldn’t reach the studio server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const working = busy !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div role="tablist" aria-label="What to score" className="score-tabs">
          {(
            [
              ["piece", "The piece", bodyScore?.total],
              ["social", "Social posts", socialScore?.total],
            ] as const
          ).map(([key, label, total]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className="chip" onClick={() => setTab(key)}>
              {label}
              {total !== undefined && <span className="score-chip-total">{total}</span>}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" aria-label={tab === "piece" ? "The piece" : "Social posts"}>
        {tab === "piece" ? (
          <>
            <ScorePanel
              score={bodyScore}
              scoring={busy === "score" || busy === "revise"}
              onRescore={hasBody ? () => void score() : undefined}
              onApplyAll={contentId ? () => void applyBody() : undefined}
              disabled={disabled || working}
              emptyText={hasBody ? "Score the piece against the evidence on what makes writing land, with checks that fit this kind of content." : "Write the body first, then score it."}
            />
            {bodyScore && !contentId && (
              <p className="form-note" style={{ color: "var(--muted)", margin: "12px 0 0" }}>
                Save the piece to apply the suggestions automatically.
              </p>
            )}
            {bodyScore && contentId && (
              <p className="form-note" style={{ color: "var(--muted)", margin: "12px 0 0" }}>
                Applying the suggestions rewrites only what they cover, keeps every figure, link and block, and puts the result in the editor for you to review. Nothing is saved until you save.
              </p>
            )}
          </>
        ) : (
          <ScorePanel
            score={socialScore}
            scoring={busy === "score" || busy === "social"}
            onRescore={hasBody ? () => void score() : undefined}
            onApply={(c) => void applySocial(c)}
            disabled={disabled || working}
            emptyText={hasSocial ? "Score the piece to see how its LinkedIn and X posts measure up." : "Write or generate the LinkedIn and X posts below, then score them."}
          />
        )}
      </div>
    </div>
  );
}
