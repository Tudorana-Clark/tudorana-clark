"use client";

import { useEffect, useState, useTransition } from "react";

import { savePlaybookAction } from "@/app/studio/article-actions";
import type { Playbook } from "@/lib/types";

import { Panel, TextField } from "./fields";

/** Editorial rules every article outline, draft and fact-check follows. */
export function PlaybookEditor({ initial }: { initial: Playbook }) {
  const [rules, setRules] = useState(initial.rules);
  const [saved, setSaved] = useState(initial.rules);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = rules !== saved;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function save() {
    startTransition(async () => {
      const res = await savePlaybookAction(rules);
      if (!res.ok) return setNote({ tone: "error", text: res.error });
      setSaved(res.data.rules);
      setRules(res.data.rules);
      setNote({ tone: "success", text: res.message ?? "Saved." });
    });
  }

  return (
    <Panel title="Article playbook">
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
        Your rules for long-form articles: purpose, structure, evidence, voice, guardrails and quality bar. The outline, draft, fact-check and distribution steps all follow it.
        {!initial.updated_at && " These are your house rules, loaded as a starting point; save to make them yours."}
      </p>
      <TextField label="Rules" multiline rows={24} value={rules} onChange={setRules} max={12000} />
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="pill sm" onClick={save} disabled={pending || !dirty || !rules.trim()}>
          {pending ? "Saving…" : "Save playbook"}
        </button>
        {dirty && <span style={{ fontSize: 13, color: "var(--muted)" }}>Unsaved changes</span>}
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
