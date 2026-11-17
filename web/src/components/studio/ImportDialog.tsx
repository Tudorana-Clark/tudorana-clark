"use client";

import { useEffect, useId, useRef, useState } from "react";

import { previewImportAction, saveImportAction } from "@/app/studio/library-actions";
import type { ImportCandidate } from "@/lib/types";

import { LinkPill, sourceByline } from "./SourceBits";

type Stage = { step: "paste" } | { step: "reading" } | { step: "review"; candidates: ImportCandidate[]; keep: boolean[]; note: string } | { step: "saving"; candidates: ImportCandidate[]; keep: boolean[]; note: string };

/**
 * Paste research from Claude (or anywhere), preview the sources it cites, untick the weak ones, save.
 * Only sources whose link appears in the pasted text are offered: no link, no source.
 */
export function ImportDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [stage, setStage] = useState<Stage>({ step: "paste" });
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  function reset() {
    setStage({ step: "paste" });
    setError(null);
  }

  async function read() {
    setError(null);
    setStage({ step: "reading" });
    try {
      const res = await previewImportAction(text, label);
      if (!res.ok) {
        setError(res.error);
        return setStage({ step: "paste" });
      }
      // Broken links start unticked; everything else starts ticked.
      setStage({ step: "review", candidates: res.data.candidates, keep: res.data.candidates.map((c) => c.link_status !== "broken"), note: res.message ?? "" });
    } catch {
      setError("We couldn’t reach the studio server. Check your connection and try again.");
      setStage({ step: "paste" });
    }
  }

  async function save() {
    if (stage.step !== "review") return;
    const chosen = stage.candidates.filter((_, i) => stage.keep[i]);
    setStage({ ...stage, step: "saving" });
    try {
      const res = await saveImportAction(chosen, label);
      if (!res.ok) {
        setError(res.error);
        return setStage({ ...stage, step: "review" });
      }
      setText("");
      setLabel("");
      reset();
      onSaved(res.message ?? "Saved.");
    } catch {
      setError("We couldn’t reach the studio server. Check your connection and try again.");
      setStage({ ...stage, step: "review" });
    }
  }

  const reviewing = stage.step === "review" || stage.step === "saving";
  const chosenCount = reviewing ? stage.keep.filter(Boolean).length : 0;

  return (
    <dialog ref={ref} className="dialog" style={{ width: "min(760px, calc(100vw - 32px))" }} aria-labelledby={`${ids}-t`} onClose={onClose} onCancel={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <h2 id={`${ids}-t`} className="display" style={{ fontSize: 24, margin: 0 }}>
              Import research
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
              Paste a research report from Claude, or any notes with links. Each cited source and its figures are pulled out. Anything without a link in the text is skipped.
            </p>
          </div>
          <button type="button" className="pill ghost sm" onClick={onClose} aria-label="Close import">
            Close
          </button>
        </div>

        {!reviewing && (
          <>
            <div className="field">
              <label htmlFor={`${ids}-text`}>Research</label>
              <textarea id={`${ids}-text`} className="input" rows={12} value={text} maxLength={120_000} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole report, including its sources or footnotes…" disabled={stage.step === "reading"} />
              <span style={{ fontSize: 12 }}>{text.length.toLocaleString("en-GB")} / 120,000 characters</span>
            </div>
            <div className="field">
              <label htmlFor={`${ids}-label`}>Label (optional)</label>
              <input id={`${ids}-label`} className="input" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Claude research: UK SME AI adoption, Nov 2026" disabled={stage.step === "reading"} />
            </div>
          </>
        )}

        <div aria-live="polite" aria-busy={stage.step === "reading"}>
          {stage.step === "reading" && (
            <div style={{ display: "grid", gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 64 }} />
              ))}
              <p className="form-note" style={{ color: "var(--muted)" }}>
                Reading the research and checking every link. Long reports take a minute.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="form-note" data-tone="error">
              {error}
            </p>
          )}
          {reviewing && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p className="form-note" style={{ color: "var(--muted)" }}>
                {stage.note}
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto" }}>
                {stage.candidates.map((c, i) => (
                  <li key={c.source.url} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12, display: "flex", gap: 12, opacity: stage.keep[i] ? 1 : 0.55 }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={stage.keep[i]}
                      disabled={stage.step === "saving"}
                      onChange={(e) => setStage({ ...stage, keep: stage.keep.map((k, j) => (j === i ? e.target.checked : k)) })}
                      aria-label={`Import ${c.source.publisher}: ${c.source.title}`}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
                        {sourceByline(c.source)}
                        <LinkPill status={c.link_status} />
                        {c.existing_id && <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: "var(--card)" }}>Already in library: findings will merge</span>}
                      </span>
                      <a href={c.source.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15, fontWeight: 500, overflowWrap: "anywhere" }}>
                        {c.source.title}
                      </a>
                      {c.source.findings.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
                          {c.source.findings.map((f) => (
                            <li key={f.text}>{f.text}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          {reviewing ? (
            <>
              <button type="button" className="pill ghost sm" onClick={reset} disabled={stage.step === "saving"}>
                Back to the text
              </button>
              <button type="button" className="pill sm" onClick={() => void save()} disabled={stage.step === "saving" || chosenCount === 0}>
                {stage.step === "saving" ? "Saving…" : `Save ${chosenCount} ${chosenCount === 1 ? "source" : "sources"}`}
              </button>
            </>
          ) : (
            <>
              <span />
              <button type="button" className="pill sm" onClick={() => void read()} disabled={stage.step === "reading" || text.trim().length < 20}>
                {stage.step === "reading" ? "Reading…" : "Find sources"}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
