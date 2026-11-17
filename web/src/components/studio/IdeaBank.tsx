"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { addIdeaAction, deleteIdeaAction, mineIdeasAction } from "@/app/studio/studio-actions";
import { KIND_LABEL } from "@/lib/content";
import type { Idea } from "@/lib/types";

type Note = { tone: "success" | "error"; text: string } | null;

/** Ideas mined from published work plus ones you jot down. Each becomes a post in one click. */
export function IdeaBank({ initial, loadError }: { initial: Idea[]; loadError: string | null }) {
  const [ideas, setIdeas] = useState(initial);
  const [note, setNote] = useState<Note>(loadError ? { tone: "error", text: loadError } : null);
  const [draft, setDraft] = useState("");
  const [showUsed, setShowUsed] = useState(false);
  const [mining, setMining] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputId = useId();

  const open = ideas.filter((i) => !i.used_by);
  const used = ideas.length - open.length;
  const shown = showUsed ? ideas : open;

  async function mine() {
    setMining(true);
    setNote(null);
    try {
      const res = await mineIdeasAction();
      if (!res.ok) return setNote({ tone: "error", text: res.error });
      setIdeas(res.data.ideas);
      setNote({ tone: "success", text: res.message ?? "Done." });
    } catch {
      setNote({ tone: "error", text: "We couldn’t reach the studio server. Check your connection and try again." });
    } finally {
      setMining(false);
    }
  }

  function add() {
    startTransition(async () => {
      const res = await addIdeaAction(draft);
      if (!res.ok) return setNote({ tone: "error", text: res.error });
      setIdeas((list) => [res.data, ...list]);
      setDraft("");
      setNote({ tone: "success", text: "Idea saved." });
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteIdeaAction(id);
      if (!res.ok) return setNote({ tone: "error", text: res.error });
      setIdeas((list) => list.filter((i) => i.id !== id));
    });
  }

  return (
    <section aria-labelledby={`${inputId}-h`} style={{ background: "var(--white)", borderRadius: 24, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id={`${inputId}-h`} style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Idea bank
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted)" }}>Insights pulled from your articles, research and talks. Scanning only reads pieces that are new or changed.</p>
        </div>
        <button type="button" className="pill sm" onClick={() => void mine()} disabled={mining}>
          {mining ? "Reading your work…" : "Find ideas"}
        </button>
      </div>

      <form
        style={{ display: "flex", gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) add();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Add your own idea
        </label>
        <input id={inputId} className="input" value={draft} maxLength={600} onChange={(e) => setDraft(e.target.value)} placeholder="Jot down a thought to post about later" />
        <button type="submit" className="pill ghost sm" disabled={pending || !draft.trim()}>
          Add
        </button>
      </form>

      <div aria-live="polite">
        {note && (
          <p role={note.tone === "error" ? "alert" : "status"} className="form-note" data-tone={note.tone}>
            {note.text}
          </p>
        )}
      </div>

      {mining && ideas.length === 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72 }} />
          ))}
        </div>
      )}

      {shown.length === 0 && !mining ? (
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 15 }}>{ideas.length ? "Every idea has been turned into a post. Find more, or add your own." : "No ideas yet. Click “Find ideas” to mine your published work."}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((i) => (
            <li key={i.id} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8, opacity: i.used_by ? 0.6 : 1 }}>
              <span style={{ fontSize: 15, lineHeight: 1.5 }}>{i.text}</span>
              {(i.angle || i.source) && (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {[i.angle, i.source ? `${KIND_LABEL[i.source.kind]}: ${i.source.title}` : ""].filter(Boolean).join(" · ")}
                </span>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {i.used_by ? (
                  <Link className="pill ghost sm" href={`/studio/posts/${i.used_by}`}>
                    Open post
                  </Link>
                ) : (
                  <>
                    <Link className="pill sm" href={`/studio/posts/new?idea=${i.id}`}>
                      Write post
                    </Link>
                    <Link className="pill ghost sm" href={`/studio/write/new?idea=${i.id}`}>
                      Write article
                    </Link>
                  </>
                )}
                <button type="button" className="pill ghost sm" onClick={() => remove(i.id)} disabled={pending} aria-label={`Remove idea: ${i.text.slice(0, 60)}`}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {used > 0 && (
        <button type="button" className="pill ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowUsed((v) => !v)} aria-pressed={showUsed}>
          {showUsed ? "Hide used ideas" : `Show ${used} used ${used === 1 ? "idea" : "ideas"}`}
        </button>
      )}
    </section>
  );
}
