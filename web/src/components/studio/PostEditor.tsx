"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";

import { deletePostAction, savePostAction, scorePostAction, writePostAction } from "@/app/studio/studio-actions";
import type { CriterionScore, Experiment, Post, PostInput, PostStatus, PostVisual } from "@/lib/types";

import { CoverGenerator } from "./CoverGenerator";
import { Panel, TextField } from "./fields";
import { ResultsPanel } from "./ResultsPanel";
import { ScorePanel } from "./ScorePanel";

type Toast = { tone: "success" | "error"; text: string } | null;

const REFINE = ["Shorter", "Punchier opening line", "More personal, from my experience", "More practical", "End with a question"];
const STATUSES: { key: PostStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "ready", label: "Ready to post" },
  { key: "posted", label: "Posted" },
];
const VISUALS: { key: PostVisual; label: string }[] = [
  { key: "quote", label: "Quote card" },
  { key: "image", label: "Illustration" },
  { key: "none", label: "No image" },
];

function toInput(p: Post): PostInput {
  const { seed, source, idea_id, linkedin, x, hook, visual, image, cover, status, role, planned_for, score, results, experiment_id, arm } = p;
  return {
    seed,
    source,
    idea_id,
    linkedin,
    x,
    hook,
    visual,
    image,
    cover,
    status,
    role: role ?? "",
    planned_for: planned_for ?? null,
    score: score ?? null,
    results: results ?? null,
    experiment_id: experiment_id ?? null,
    arm: arm ?? "",
  };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Short-form post editor: idea → drafts in the author's voice → refine → thumbnail → copy out. */
export function PostEditor({ initial, experiments = [] }: { initial: Post | PostInput; experiments?: Experiment[] }) {
  const router = useRouter();
  const saved = "id" in initial ? initial : null;
  const [doc, setDoc] = useState<Post | null>(saved);
  const [form, setForm] = useState<PostInput>(saved ? toInput(saved) : initial);
  const [dirty, setDirty] = useState(!saved && Boolean(initial.seed));
  const [toast, setToast] = useState<Toast>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [format, setFormat] = useState<"square" | "landscape">("square");
  const [tone, setTone] = useState<"light" | "dark">("light");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const seedId = useId();
  const busy = pending || writing || scoring;
  const hasDrafts = Boolean(form.linkedin.trim() || form.x.trim());

  function update<K extends keyof PostInput>(key: K, value: PostInput[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Editing the copy makes the score out of date; the API also checks this when saving.
      if ((key === "linkedin" || key === "x") && f.score && !f.score.stale) next.score = { ...f.score, stale: true };
      return next;
    });
    setDirty(true);
  }

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "error" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function write(refine?: string, fixAll = false) {
    setWriting(true);
    try {
      const res = await writePostAction({
        seed: form.seed,
        source_id: form.source?.content_id ?? null,
        current: refine !== undefined || fixAll ? { linkedin: form.linkedin, x: form.x, hook: form.hook } : null,
        instruction: refine ?? "",
        fix_all: fixAll,
      });
      if (!res.ok) return setToast({ tone: "error", text: res.error });
      const { linkedin, x, hook, score } = res.data;
      setForm((f) => ({ ...f, linkedin, x, hook, score }));
      setDirty(true);
      setInstruction("");
      setToast({ tone: "success", text: res.message ?? "Done." });
    } catch {
      setToast({ tone: "error", text: "We couldn’t reach the studio server. Check your connection and try again." });
    } finally {
      setWriting(false);
    }
  }

  async function rescore() {
    setScoring(true);
    try {
      const res = await scorePostAction({ linkedin: form.linkedin, x: form.x, role: form.role ?? "" });
      if (!res.ok) return setToast({ tone: "error", text: res.error });
      setForm((f) => ({ ...f, score: res.data }));
      setDirty(true);
      setToast({ tone: "success", text: res.message ?? "Scored." });
    } catch {
      setToast({ tone: "error", text: "We couldn’t reach the studio server. Check your connection and try again." });
    } finally {
      setScoring(false);
    }
  }

  function applyFix(c: CriterionScore) {
    const where = c.channel === "x" ? "In the X post: " : c.channel === "linkedin" ? "In the LinkedIn post: " : "";
    void write(`${where}${c.suggestion}`.slice(0, 300));
  }

  function save(status?: PostStatus) {
    startTransition(async () => {
      const input = status ? { ...form, status } : form;
      const res = await savePostAction(doc?.id ?? null, input);
      if (!res.ok) {
        setErrorField(res.field ?? null);
        return setToast({ tone: "error", text: res.error });
      }
      setErrorField(null);
      setDoc(res.data);
      setForm(toInput(res.data));
      setDirty(false);
      setToast({ tone: "success", text: res.message ?? "Saved." });
      if (!doc) router.replace(`/studio/posts/${res.data.id}`);
    });
  }

  function remove() {
    if (!doc) return;
    startTransition(async () => {
      const res = await deletePostAction(doc.id);
      if (!res.ok) return setToast({ tone: "error", text: res.error });
      setDirty(false);
      router.push("/studio/posts");
      router.refresh();
    });
  }

  const quoteText = useDebounced(form.hook.trim(), 500);
  const quoteUrl = (download: boolean) => `/studio/quote-card?${new URLSearchParams({ text: quoteText, format, tone, ...(download ? { download: "1" } : {}) })}`;
  const xIntent = `https://x.com/intent/post?text=${encodeURIComponent(form.x)}`;
  const linkedinIntent = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(form.linkedin)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 5, background: "var(--card)", padding: "12px 0" }}>
        <div role="radiogroup" aria-label="Post status" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUSES.map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={form.status === s.key} className="chip" onClick={() => update("status", s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }} aria-live="polite">
            {pending ? "Saving…" : writing ? "Writing, scoring and polishing…" : scoring ? "Scoring…" : dirty ? "Unsaved changes" : doc ? "All changes saved" : "New post"}
          </span>
          <button type="button" className="pill sm" onClick={() => save()} disabled={busy || (!dirty && !!doc) || !form.seed.trim()}>
            Save
          </button>
        </div>
      </div>

      <div className="studio-split">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="Idea">
            <div className="field">
              <label htmlFor={seedId}>What do you want to say?</label>
              <textarea
                id={seedId}
                className="input"
                rows={4}
                value={form.seed}
                maxLength={2000}
                onChange={(e) => update("seed", e.target.value)}
                placeholder="A rough thought is fine, e.g. “When clients say ‘we need AI’ they usually mean ‘our data is a mess’.”"
                aria-invalid={errorField === "seed" ? true : undefined}
              />
            </div>
            {form.source && (
              <p className="form-note" style={{ color: "var(--muted)" }}>
                Recycled from{" "}
                <a href={form.source.path} target="_blank" rel="noopener">
                  {form.source.title}
                </a>
                . Its text is used for specifics.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="pill sm" onClick={() => void write()} disabled={busy || !form.seed.trim()}>
                {writing ? "Writing…" : hasDrafts ? "Rewrite from idea" : "Write drafts"}
              </button>
              {doc && (
                <a className="pill ghost sm" href={`/studio/write/new?post=${doc.id}`}>
                  Expand into an article
                </a>
              )}
            </div>
            {form.planned_for && (
              <p className="form-note" style={{ color: "var(--muted)" }}>
                Planned for {new Date(form.planned_for).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                {form.role ? ` · ${form.role.replace("_", " ")} post` : ""}.
              </p>
            )}
          </Panel>

          <Panel title="Refine">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {REFINE.map((r) => (
                <button key={r} type="button" className="chip" onClick={() => void write(r)} disabled={busy || !hasDrafts}>
                  {r}
                </button>
              ))}
            </div>
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (instruction.trim()) void write(instruction.trim());
              }}
            >
              <label className="sr-only" htmlFor={`${seedId}-refine`}>
                Your own instruction
              </label>
              <input id={`${seedId}-refine`} className="input" value={instruction} maxLength={300} onChange={(e) => setInstruction(e.target.value)} placeholder="Or say what to change, e.g. “mention the KPMG stat”" disabled={!hasDrafts} />
              <button type="submit" className="pill ghost sm" disabled={busy || !hasDrafts || !instruction.trim()}>
                Apply
              </button>
            </form>
            {!hasDrafts && <p className="form-note" style={{ color: "var(--muted)" }}>Write drafts first, then refine them here.</p>}
          </Panel>

          <Panel title="LinkedIn">
            <TextField label="Post" multiline rows={12} value={form.linkedin} onChange={(v) => update("linkedin", v)} max={3000} ideal={[500, 1300]} invalid={errorField === "linkedin"} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <CopyButton text={form.linkedin} label="Copy LinkedIn post" />
              <a className="pill ghost sm" aria-disabled={!form.linkedin} href={form.linkedin ? linkedinIntent : undefined} target="_blank" rel="noopener noreferrer">
                Open LinkedIn
              </a>
            </div>
          </Panel>

          <Panel title="X">
            <TextField label="Post" multiline rows={4} value={form.x} onChange={(v) => update("x", v)} max={280} invalid={errorField === "x"} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <CopyButton text={form.x} label="Copy X post" />
              <a className="pill ghost sm" aria-disabled={!form.x} href={form.x ? xIntent : undefined} target="_blank" rel="noopener noreferrer">
                Post to X
              </a>
            </div>
          </Panel>

          <Panel title="Results">
            <ResultsPanel
              results={form.results}
              onChange={(r) => update("results", r)}
              experiments={experiments}
              experimentId={form.experiment_id}
              arm={form.arm ?? ""}
              onExperiment={(id, arm) => {
                setForm((f) => ({ ...f, experiment_id: id, arm }));
                setDirty(true);
              }}
              hasLinkedin={Boolean(form.linkedin.trim())}
              hasX={Boolean(form.x.trim())}
              posted={form.status === "posted"}
              errorField={errorField}
            />
          </Panel>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="Score">
            <ScorePanel
              score={form.score}
              scoring={scoring || writing}
              onRescore={hasDrafts ? () => void rescore() : undefined}
              onApply={applyFix}
              onApplyAll={hasDrafts ? () => void write(undefined, true) : undefined}
              disabled={busy}
              emptyText={hasDrafts ? "These drafts haven’t been scored yet." : "Write drafts to see how they score against the evidence, with fixes you can apply in one click."}
            />
          </Panel>

          <Panel title="Thumbnail">
            <div role="radiogroup" aria-label="Thumbnail type" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {VISUALS.map((v) => (
                <button key={v.key} type="button" role="radio" aria-checked={form.visual === v.key} className="chip" onClick={() => update("visual", v.key)}>
                  {v.label}
                </button>
              ))}
            </div>

            {form.visual === "quote" && (
              <>
                <TextField label="Quote line" multiline rows={3} value={form.hook} onChange={(v) => update("hook", v)} max={260} hint="One line that stands on its own. Wrap words in <box>…</box> to highlight them in gold." invalid={errorField === "hook"} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div role="radiogroup" aria-label="Card shape" style={{ display: "flex", gap: 8 }}>
                    {(["square", "landscape"] as const).map((f) => (
                      <button key={f} type="button" role="radio" aria-checked={format === f} className="chip" onClick={() => setFormat(f)}>
                        {f === "square" ? "Square" : "Landscape"}
                      </button>
                    ))}
                  </div>
                  <div role="radiogroup" aria-label="Card colours" style={{ display: "flex", gap: 8 }}>
                    {(["light", "dark"] as const).map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={tone === t} className="chip" onClick={() => setTone(t)}>
                        {t === "light" ? "Light" : "Navy"}
                      </button>
                    ))}
                  </div>
                </div>
                {quoteText ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={quoteUrl(false)} alt={`Quote card: ${quoteText.replace(/<\/?box>/gi, "")}`} style={{ width: "100%", borderRadius: 14, aspectRatio: format === "square" ? "1 / 1" : "16 / 9", background: "var(--card)" }} />
                    <a className="pill ghost sm" style={{ alignSelf: "flex-start" }} href={quoteUrl(true)} download>
                      Download PNG
                    </a>
                  </>
                ) : (
                  <div className="placeholder" style={{ aspectRatio: format === "square" ? "1 / 1" : "16 / 9", display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 14, padding: 16, textAlign: "center" }}>
                    Add a quote line to preview the card.
                  </div>
                )}
              </>
            )}

            {form.visual === "image" && (
              <>
                {form.image && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.image.url} alt={form.image.alt} style={{ borderRadius: 14, aspectRatio: "16 / 10", objectFit: "cover", width: "100%" }} />
                    <a className="pill ghost sm" style={{ alignSelf: "flex-start" }} href={form.image.url} target="_blank" rel="noopener" download>
                      Open full size
                    </a>
                  </>
                )}
                <CoverGenerator
                  form={{ kind: "note", title: (form.hook || form.seed).slice(0, 200), body: [form.seed, form.linkedin].filter(Boolean).join("\n\n"), category: "", cover: form.cover }}
                  selectedUrl={form.image?.url ?? null}
                  onPick={(image, cover) => {
                    setForm((f) => ({ ...f, image, cover }));
                    setDirty(true);
                  }}
                />
              </>
            )}
          </Panel>

          {doc && (
            <Panel title="Manage">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {form.status !== "posted" && (
                  <button type="button" className="pill ghost sm" onClick={() => save("posted")} disabled={busy}>
                    Mark as posted
                  </button>
                )}
                {confirmDelete ? (
                  <>
                    <button type="button" className="pill danger sm" onClick={remove} disabled={busy}>
                      Delete permanently
                    </button>
                    <button type="button" className="pill ghost sm" onClick={() => setConfirmDelete(false)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button type="button" className="pill danger sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
                    Delete
                  </button>
                )}
              </div>
              {confirmDelete && (
                <p role="alert" className="form-note" data-tone="error">
                  This deletes the post from your library. It can’t be undone.
                </p>
              )}
            </Panel>
          )}
        </aside>
      </div>

      {toast && (
        <div className="toast" role={toast.tone === "error" ? "alert" : "status"} style={{ background: toast.tone === "error" ? "var(--danger)" : "var(--ink)", maxWidth: "calc(100vw - 32px)" }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      className="pill ghost sm"
      aria-label={label}
      disabled={!text}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setState("done"),
          () => setState("error"),
        )
      }
    >
      <span aria-live="polite">{state === "done" ? "Copied" : state === "error" ? "Copy failed" : "Copy"}</span>
    </button>
  );
}
