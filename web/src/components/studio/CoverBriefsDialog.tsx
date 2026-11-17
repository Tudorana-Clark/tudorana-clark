"use client";

import { useEffect, useId, useRef, useState } from "react";

import { coverBriefsAction } from "@/app/studio/studio-actions";
import type { CoverBrief, Kind } from "@/lib/types";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; briefs: CoverBrief[] };

/**
 * Modal that asks the art director for four cover briefs drawn from the piece itself.
 * The author picks one and that exact scene is rendered, which beats letting the image step guess.
 */
export function CoverBriefsDialog({ open, onClose, onChoose, piece }: { open: boolean; onClose: () => void; onChoose: (scene: string) => void; piece: { kind: Kind; title: string; body: string; category: string } }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  const [choice, setChoice] = useState(0);
  const titleId = useId();
  // Read the latest piece when the dialog opens, without re-running the open effect on every keystroke.
  const pieceRef = useRef(piece);
  useEffect(() => {
    pieceRef.current = piece;
  });

  async function load() {
    setState({ status: "loading" });
    setChoice(0);
    try {
      const res = await coverBriefsAction(pieceRef.current);
      setState(res.ok ? { status: "ready", briefs: res.data } : { status: "error", message: res.error });
    } catch {
      setState({ status: "error", message: "We couldn’t reach the studio server. Check your connection and try again." });
    }
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      void load();
    } else if (!open && d.open) d.close();
  }, [open]);

  const ready = state.status === "ready" ? state : null;

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h2 id={titleId} className="display" style={{ fontSize: 24, margin: 0 }}>
              Cover ideas
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted)" }}>Four ways to picture this piece. Pick one and it’s drawn exactly as written.</p>
          </div>
          <button type="button" className="pill ghost sm" onClick={onClose} aria-label="Close cover ideas">
            Close
          </button>
        </div>

        <div aria-live="polite" aria-busy={state.status === "loading"}>
          {state.status === "loading" && (
            <div style={{ display: "grid", gap: 8 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 76 }} />
              ))}
              <p className="form-note" style={{ color: "var(--muted)" }}>
                Reading the piece and sketching ideas…
              </p>
            </div>
          )}
          {state.status === "error" && (
            <p role="alert" className="form-note" data-tone="error">
              {state.message}
            </p>
          )}
          {ready && (
            <div role="radiogroup" aria-label="Cover ideas" style={{ display: "grid", gap: 8 }}>
              {ready.briefs.map((b, i) => (
                <button key={b.scene} type="button" role="radio" aria-checked={choice === i} className="brief-option" onClick={() => setChoice(i)} onDoubleClick={() => onChoose(b.scene)}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{b.label}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.45 }}>{b.scene}</span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{b.why}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="pill ghost sm" onClick={() => void load()} disabled={state.status === "loading"}>
            New ideas
          </button>
          <button type="button" className="pill sm" disabled={!ready} onClick={() => ready?.briefs[choice] && onChoose(ready.briefs[choice].scene)}>
            Draw this one
          </button>
        </div>
      </div>
    </dialog>
  );
}
