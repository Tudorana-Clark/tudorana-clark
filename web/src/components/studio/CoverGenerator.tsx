"use client";

import { useId, useState } from "react";

import { generateCoversAction } from "@/app/studio/actions";
import type { ContentInput, CoverInfo, CoverResult, Image } from "@/lib/types";

type State = { status: "idle" } | { status: "loading"; count: number } | { status: "error"; message: string } | { status: "ready"; result: CoverResult; note: string };

const EXPECTED = 3; // matches the API default; only used to size the skeleton grid

/**
 * Generates on-brand cover options from a one-line visual idea, using the versioned style kit on the API.
 * Picking an option makes it the feature image and records its provenance so it can be re-rendered later.
 */
export function CoverGenerator({
  form,
  selectedUrl,
  onPick,
}: {
  form: Pick<ContentInput, "kind" | "title" | "body" | "category" | "cover">;
  selectedUrl: string | null;
  onPick: (image: Image, cover: CoverInfo) => void;
}) {
  const [concept, setConcept] = useState(form.cover?.concept ?? "");
  // The last scene the art director returned. Re-rendering it unchanged skips re-interpretation.
  const [scene, setScene] = useState(form.cover?.concept ?? "");
  const [state, setState] = useState<State>({ status: "idle" });
  const conceptId = useId();
  const hintId = useId();
  const busy = state.status === "loading";
  const noTitle = !form.title.trim();

  async function generate() {
    setState({ status: "loading", count: state.status === "ready" ? state.result.candidates.length || EXPECTED : EXPECTED });
    try {
      const res = await generateCoversAction({ kind: form.kind, title: form.title, body: form.body, category: form.category, concept, literal: Boolean(concept.trim()) && concept.trim() === scene.trim() });
      if (!res.ok) return setState({ status: "error", message: res.error });
      setConcept(res.data.concept);
      setScene(res.data.concept);
      setState({ status: "ready", result: res.data, note: res.message ?? "" });
    } catch {
      setState({ status: "error", message: "We couldn’t reach the studio server. Check your connection and try again." });
    }
  }

  function pick(result: CoverResult, i: number) {
    const c = result.candidates[i];
    if (!c) return;
    onPick({ url: c.url, alt: result.alt, width: c.width, height: c.height }, { style_version: result.style_version, model: result.model, concept: result.concept, generated_at: new Date().toISOString() });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
      <div className="field">
        <label htmlFor={conceptId}>Cover idea</label>
        <input
          id={conceptId}
          className="input"
          value={concept}
          maxLength={300}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="Leave blank to let AI pick an idea from the piece"
          aria-describedby={hintId}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy && !noTitle) {
              e.preventDefault();
              void generate();
            }
          }}
        />
        <span id={hintId} style={{ fontSize: 13, color: "var(--muted)" }}>
          Describe the idea in your own words, e.g. “small firms out-pacing big ones with AI”. It’s turned into a drawn scene in the house style; edit that scene to fine-tune it.
        </span>
      </div>

      <button type="button" className="pill sm" style={{ alignSelf: "flex-start" }} onClick={() => void generate()} disabled={busy || noTitle} title={noTitle ? "Add a title first" : undefined}>
        {busy ? "Rendering options…" : state.status === "ready" ? "Generate new options" : "Generate cover"}
      </button>

      <div aria-live="polite" aria-busy={busy} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {busy && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
              {Array.from({ length: state.count }, (_, i) => (
                <div key={i} className="skeleton" style={{ aspectRatio: "16 / 10" }} />
              ))}
            </div>
            <p className="form-note" style={{ color: "var(--muted)" }}>
              Rendering in the house style. This usually takes 20–60 seconds.
            </p>
          </>
        )}

        {state.status === "error" && (
          <p role="alert" className="form-note" data-tone="error">
            {state.message}
          </p>
        )}

        {state.status === "ready" && (
          <>
            <div role="radiogroup" aria-label="Cover options" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
              {state.result.candidates.map((c, i) => {
                const selected = c.url === selectedUrl;
                return (
                  <button key={c.url} type="button" role="radio" aria-checked={selected} aria-label={`Use option ${i + 1}`} className="cover-option" onClick={() => pick(state.result, i)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt="" width={c.width} height={c.height} loading="lazy" decoding="async" />
                  </button>
                );
              })}
            </div>
            <p className="form-note" style={{ color: "var(--muted)" }}>
              {state.note}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
