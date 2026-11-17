"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { createArticleAction } from "@/app/studio/article-actions";
import type { SourceRef } from "@/lib/types";

/** First step: confirm the insight, then the plan is created and opened in the workbench. */
export function ArticleStart({ insight: initialInsight, sourceRef, ideaId }: { insight: string; sourceRef: SourceRef | null; ideaId: string | null }) {
  const router = useRouter();
  const [insight, setInsight] = useState(initialInsight);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await createArticleAction({ insight, angle: "", headline: "", headline_options: [], outline: [], sources: [], field_notes: "", source_ref: sourceRef, idea_id: ideaId });
      if (!res.ok) return setError(res.error);
      router.push(`/studio/write/${res.data.id}`);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (insight.trim()) start();
      }}
      style={{ background: "var(--white)", borderRadius: 24, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <label htmlFor={id} style={{ fontSize: 15, fontWeight: 600 }}>
        What’s the insight?
      </label>
      <textarea
        id={id}
        className="input"
        rows={5}
        value={insight}
        maxLength={3000}
        onChange={(e) => setInsight(e.target.value)}
        placeholder="A rough thought is fine, e.g. “Most businesses asking for AI actually need their data sorted first — and that’s good news for small firms.”"
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="form-note" data-tone="error">
          {error}
        </p>
      )}
      <button type="submit" className="pill sm" style={{ alignSelf: "flex-start" }} disabled={pending || !insight.trim()}>
        {pending ? "Starting…" : "Start the article"}
      </button>
    </form>
  );
}
