"use client";

import { useEffect, useState, useTransition } from "react";

import { learnVoiceAction, saveVoiceAction } from "@/app/studio/studio-actions";
import type { VoiceProfile } from "@/lib/types";

import { Panel, TextField } from "./fields";

type Note = { tone: "success" | "error"; text: string } | null;

/** The tone-of-voice guide every post draft uses. Learned from published work, then edited by hand. */
export function VoiceEditor({ initial }: { initial: VoiceProfile }) {
  const [guide, setGuide] = useState(initial.guide);
  const [savedGuide, setSavedGuide] = useState(initial.guide);
  const [note, setNote] = useState<Note>(null);
  const [learning, setLearning] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = guide !== savedGuide;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function learn() {
    setLearning(true);
    setNote(null);
    try {
      const res = await learnVoiceAction();
      if (!res.ok) return setNote({ tone: "error", text: res.error });
      setGuide(res.data.guide);
      setNote({ tone: "success", text: res.message ?? "Drafted." });
    } catch {
      setNote({ tone: "error", text: "We couldn’t reach the studio server. Check your connection and try again." });
    } finally {
      setLearning(false);
    }
  }

  function save() {
    startTransition(async () => {
      const res = await saveVoiceAction(guide);
      if (!res.ok) return setNote({ tone: "error", text: res.error });
      setSavedGuide(res.data.guide);
      setGuide(res.data.guide);
      setNote({ tone: "success", text: res.message ?? "Saved." });
    });
  }

  return (
    <Panel
      title="Voice guide"
      action={
        <button type="button" className="pill ghost sm" onClick={() => void learn()} disabled={learning || pending}>
          {learning ? "Reading your writing…" : savedGuide ? "Re-learn from my writing" : "Learn from my writing"}
        </button>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
        Every post draft is written to this guide. Learn it from your published articles, research and talks, then edit anything that doesn’t sound like you. Re-learning replaces the text in the box; nothing changes until you save.
      </p>
      {learning && !guide ? (
        <div className="skeleton" style={{ height: 280 }} />
      ) : (
        <TextField label="Guide" multiline rows={16} value={guide} onChange={setGuide} max={4000} placeholder="e.g. British English. Plain and specific, no hype. Lead with the point, then the client story…" />
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="pill sm" onClick={save} disabled={pending || learning || !dirty}>
          {pending ? "Saving…" : "Save voice"}
        </button>
        {dirty && <span style={{ fontSize: 13, color: "var(--muted)" }}>Unsaved changes</span>}
        {!dirty && initial.updated_at && savedGuide === initial.guide && (
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Saved {new Date(initial.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
      </div>
      <div aria-live="polite">
        {note && (
          <p role={note.tone === "error" ? "alert" : "status"} className="form-note" data-tone={note.tone}>
            {note.text}
          </p>
        )}
      </div>
    </Panel>
  );
}
