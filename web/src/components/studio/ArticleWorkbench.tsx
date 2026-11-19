"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { checkAction, deleteArticleAction, distributeAction, draftAction, outlineAction, polishAction, researchAction, saveArticleAction } from "@/app/studio/article-actions";
import type { ArticleSource, ArticleWork, ArticleWorkInput, ClaimCheck, OutlineSection, Post } from "@/lib/types";

import { Panel, TextField } from "./fields";
import { ScorePanel } from "./ScorePanel";
import { SourcePicker } from "./SourcePicker";

type Toast = { tone: "success" | "error"; text: string } | null;
type Busy = null | "save" | "outline" | "research" | "draft" | "check" | "polish" | "distribute" | "delete";

const STEPS = [
  { id: "brief", label: "Brief" },
  { id: "outline", label: "Outline" },
  { id: "research", label: "Research" },
  { id: "field", label: "From the field" },
  { id: "draft", label: "Draft" },
  { id: "check", label: "Fact-check" },
  { id: "distribute", label: "Distribute" },
] as const;

const FIELD_PROMPTS = ["Which client or Monster moment shows this?", "What did they assume, and what actually happened?", "What changed, in numbers you can stand behind?", "What would you tell them to do differently?"];

const CLAIM_STYLE: Record<ClaimCheck["status"], { label: string; bg: string; fg: string }> = {
  sourced: { label: "Sourced", bg: "#E6F2EA", fg: "var(--success)" },
  experience: { label: "Your experience", bg: "var(--card)", fg: "var(--muted)" },
  mismatch: { label: "Doesn’t match source", bg: "#FBE9E4", fg: "var(--danger)" },
  unsourced: { label: "No source", bg: "#FBE9E4", fg: "var(--danger)" },
};

function toInput(w: ArticleWork): ArticleWorkInput {
  const { insight, angle, headline, headline_options, outline, sources, field_notes, source_ref, idea_id } = w;
  return { insight, angle, headline, headline_options, outline, sources, field_notes, source_ref, idea_id };
}

function words(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** Insight → outline → research → your story → draft → fact-check → distribution, following the article playbook. */
export function ArticleWorkbench({ initial }: { initial: ArticleWork }) {
  const router = useRouter();
  const [work, setWork] = useState(initial);
  const [form, setForm] = useState<ArticleWorkInput>(toInput(initial));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [researching, setResearching] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [askQuery, setAskQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ids = useId();

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "error" ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function update<K extends keyof ArticleWorkInput>(key: K, value: ArticleWorkInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }
  const updateSection = (i: number, patch: Partial<OutlineSection>) => update("outline", form.outline.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const updateSource = (id: string, patch: Partial<ArticleSource>) => update("sources", form.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  function accept(next: ArticleWork, message?: string) {
    setWork(next);
    setForm(toInput(next));
    setDirty(false);
    if (message) setToast({ tone: "success", text: message });
  }

  /** Persist edits before any AI step, so the server always works from what you see. */
  async function saveFirst(): Promise<boolean> {
    if (!dirty) return true;
    const res = await saveArticleAction(work.id, form);
    if (!res.ok) {
      setToast({ tone: "error", text: res.error });
      return false;
    }
    accept(res.data);
    return true;
  }

  async function run(kind: Exclude<Busy, null>, step: () => Promise<{ ok: true; data: ArticleWork; message?: string } | { ok: false; error: string }>) {
    setBusy(kind);
    try {
      if (!(await saveFirst())) return;
      const res = await step();
      if (!res.ok) return setToast({ tone: "error", text: res.error });
      accept(res.data, res.message);
      if (kind === "draft" || kind === "polish") router.refresh();
    } catch {
      setToast({ tone: "error", text: "We couldn’t reach the studio server. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function research(section: string, query = "") {
    setBusy("research");
    setResearching(section || "ask");
    try {
      if (!(await saveFirst())) return;
      const res = await researchAction(work.id, section, query);
      if (!res.ok) return setToast({ tone: "error", text: res.error });
      accept(res.data.work, res.message);
      if (!section) setAskQuery("");
    } catch {
      setToast({ tone: "error", text: "We couldn’t reach the studio server. Check your connection and try again." });
    } finally {
      setBusy(null);
      setResearching(null);
    }
  }

  async function researchAll() {
    for (const s of form.outline.filter((x) => x.research.trim())) {
      await research(s.key);
    }
  }

  async function distribute() {
    setBusy("distribute");
    try {
      const res = await distributeAction(work.id);
      if (!res.ok) return setToast({ tone: "error", text: res.error });
      setPosts(res.data);
      setWork((w) => ({ ...w, distributed: [...w.distributed, ...res.data.map((p) => p.id)] }));
      setToast({ tone: "success", text: res.message ?? "Posts created." });
    } catch {
      setToast({ tone: "error", text: "We couldn’t reach the studio server. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    const res = await deleteArticleAction(work.id);
    setBusy(null);
    if (!res.ok) return setToast({ tone: "error", text: res.error });
    setDirty(false);
    router.push("/studio/write");
  }

  function addOwnSource(fd: FormData) {
    const src: ArticleSource = {
      id: `own-${Date.now().toString(36)}`,
      url: String(fd.get("url") ?? "").trim(),
      publisher: String(fd.get("publisher") ?? "").trim(),
      title: String(fd.get("title") ?? "").trim(),
      published: String(fd.get("published") ?? "").trim(),
      sponsor: String(fd.get("sponsor") ?? "").trim(),
      finding: String(fd.get("finding") ?? "").trim(),
      section: String(fd.get("section") ?? ""),
      selected: true,
      added_by: "author",
    };
    if (!src.url || !src.publisher || !src.title) return setToast({ tone: "error", text: "Add at least the link, publisher and title." });
    update("sources", [...form.sources, src]);
  }

  const isBusy = busy !== null;
  const fieldWords = words(form.field_notes);
  const selected = form.sources.filter((s) => s.selected).length;
  const sectionTitle = (key: string) => form.outline.find((s) => s.key === key)?.title ?? (key ? key : "General");
  const groups = [...new Set(form.sources.map((s) => s.section))];
  const check = work.check;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 5, background: "var(--card)", padding: "12px 0" }}>
        <nav aria-label="Article steps" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {STEPS.map((s, i) => (
            <a key={s.id} href={`#${ids}-${s.id}`} className="chip" style={{ display: "inline-flex", alignItems: "center", color: "var(--ink)" }}>
              {i + 1}. {s.label}
            </a>
          ))}
        </nav>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }} aria-live="polite">
            {busy === "research" ? "Researching the web…" : busy === "draft" ? "Writing the draft…" : busy === "check" ? "Checking every claim and scoring the copy…" : busy === "polish" ? "Applying the suggestions…" : busy === "outline" ? "Planning the outline…" : busy ? "Working…" : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            type="button"
            className="pill sm"
            disabled={isBusy || !dirty}
            onClick={async () => {
              setBusy("save");
              if (await saveFirst()) setToast({ tone: "success", text: "Plan saved." });
              setBusy(null);
            }}
          >
            Save
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
        {/* 1. Brief */}
        <section id={`${ids}-brief`}>
          <Panel title="1. Brief">
            <TextField label="Insight to develop" multiline rows={4} value={form.insight} onChange={(v) => update("insight", v)} max={3000} />
            {form.source_ref && (
              <p className="form-note" style={{ color: "var(--muted)" }}>
                Builds on{" "}
                <a href={form.source_ref.path} target="_blank" rel="noopener">
                  {form.source_ref.title}
                </a>
                .
              </p>
            )}
            <TextField label="Argument (one sentence; the outline fills this if empty)" value={form.angle} onChange={(v) => update("angle", v)} max={600} />
            <TextField label="Headline" value={form.headline} onChange={(v) => update("headline", v)} max={200} />
            {form.headline_options.length > 0 && (
              <div role="radiogroup" aria-label="Headline options" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {form.headline_options.map((h) => (
                  <button key={h} type="button" role="radio" aria-checked={form.headline === h} className="chip" onClick={() => update("headline", h)}>
                    {h}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="pill sm" style={{ alignSelf: "flex-start" }} disabled={isBusy || !form.insight.trim()} onClick={() => void run("outline", () => outlineAction(work.id))}>
              {busy === "outline" ? "Planning…" : form.outline.length ? "Re-plan the outline" : "Plan the outline"}
            </button>
          </Panel>
        </section>

        {/* 2. Outline */}
        <section id={`${ids}-outline`}>
          <Panel title="2. Outline">
            {form.outline.length === 0 ? (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 15 }}>Plan the outline from your brief. It follows your playbook’s structure, and you can edit every section.</p>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                {form.outline.map((s, i) => (
                  <li key={s.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <TextField label="Section" value={s.title} onChange={(v) => updateSection(i, { title: v })} max={300} />
                    <TextField label="What it must do" multiline rows={2} value={s.purpose} onChange={(v) => updateSection(i, { purpose: v })} max={600} />
                    <TextField label="Research question (leave empty if no outside evidence is needed)" value={s.research} onChange={(v) => updateSection(i, { research: v })} max={300} />
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </section>

        {/* 3. Research */}
        <section id={`${ids}-research`}>
          <Panel
            title="3. Research"
            action={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="pill ghost sm" disabled={isBusy} onClick={() => setPickerOpen(true)}>
                  Add from library
                </button>
                <button type="button" className="pill sm" disabled={isBusy || !form.outline.some((s) => s.research.trim())} onClick={() => void researchAll()}>
                  {busy === "research" ? "Researching…" : "Research the web"}
                </button>
              </div>
            }
          >
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
              Start with your library (it includes everything you’ve imported or researched before), then search the web for gaps. The researcher looks for recent primary sources and saves what it finds to your library. A finding is kept only if its link actually came back from the search, so no citation is invented. Untick anything you won’t use; only ticked sources go into the draft. Always open the link and check the figure before publishing.
            </p>
            {form.outline
              .filter((s) => s.research.trim())
              .map((s) => (
                <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <span style={{ fontSize: 14 }}>
                    <strong style={{ fontWeight: 600 }}>{s.title}</strong>
                    <span style={{ color: "var(--muted)" }}> · {s.research}</span>
                  </span>
                  <button type="button" className="pill ghost sm" disabled={isBusy} onClick={() => void research(s.key)}>
                    {researching === s.key ? "Searching…" : "Find sources"}
                  </button>
                </div>
              ))}
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (askQuery.trim()) void research("", askQuery.trim());
              }}
            >
              <label className="sr-only" htmlFor={`${ids}-ask`}>
                Ask the researcher
              </label>
              <input id={`${ids}-ask`} className="input" value={askQuery} maxLength={300} onChange={(e) => setAskQuery(e.target.value)} placeholder="Ask the researcher anything, e.g. “UK SME AI adoption 2026 ONS”" />
              <button type="submit" className="pill ghost sm" disabled={isBusy || !askQuery.trim()}>
                {researching === "ask" ? "Searching…" : "Search"}
              </button>
            </form>

            {groups.map((g) => (
              <div key={g || "general"} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <h3 style={{ margin: "8px 0 0", fontSize: 14, fontWeight: 600 }}>{sectionTitle(g)}</h3>
                {form.sources
                  .filter((s) => s.section === g)
                  .map((s) => (
                    <div key={s.id} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 14, display: "flex", gap: 12, opacity: s.selected ? 1 : 0.55 }}>
                      <input type="checkbox" className="checkbox" checked={s.selected} onChange={(e) => updateSource(s.id, { selected: e.target.checked })} aria-label={`Use ${s.publisher}: ${s.title}`} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>
                          {[s.publisher, s.sponsor ? `sponsored by ${s.sponsor}` : "", s.published || "date unknown", s.added_by === "author" ? "added by you" : ""].filter(Boolean).join(" · ")}
                        </span>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15, fontWeight: 500, overflowWrap: "anywhere" }}>
                          {s.title}
                        </a>
                        {s.finding && <span style={{ fontSize: 15, lineHeight: 1.5 }}>{s.finding}</span>}
                      </div>
                      <button type="button" className="pill ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => update("sources", form.sources.filter((x) => x.id !== s.id))} aria-label={`Remove source ${s.title}`}>
                        Remove
                      </button>
                    </div>
                  ))}
              </div>
            ))}

            <SourcePicker
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              sections={form.outline}
              initialQuery={form.headline || form.insight.slice(0, 120)}
              alreadyAdded={new Set(form.sources.map((s) => `${s.url}|${s.finding}`))}
              onAdd={(src) => {
                if (form.sources.length >= 40) return setToast({ tone: "error", text: "This plan already has 40 sources. Remove some you won’t use first." });
                update("sources", [...form.sources, src]);
              }}
            />
            <details>
              <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 500 }}>Add a source you already have</summary>
              <form
                style={{ display: "grid", gap: 8, marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  addOwnSource(new FormData(e.currentTarget));
                  e.currentTarget.reset();
                }}
              >
                <input className="input" name="url" type="url" required placeholder="Link to the original report" aria-label="Source link" />
                <div className="g2">
                  <input className="input" name="publisher" required placeholder="Publisher, e.g. KPMG" aria-label="Publisher" maxLength={300} />
                  <input className="input" name="published" placeholder="Month and year, e.g. June 2026" aria-label="Month and year" maxLength={40} />
                </div>
                <input className="input" name="title" required placeholder="Report title" aria-label="Report title" maxLength={300} />
                <input className="input" name="sponsor" placeholder="Sponsor, if the research was paid for" aria-label="Sponsor" maxLength={300} />
                <textarea className="input" name="finding" rows={2} placeholder="The figure or finding, exactly as the source states it" aria-label="Finding" maxLength={800} />
                <select className="input" name="section" aria-label="Section" defaultValue="">
                  <option value="">General</option>
                  {form.outline.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <button type="submit" className="pill ghost sm" style={{ justifySelf: "start" }}>
                  Add source
                </button>
              </form>
            </details>
          </Panel>
        </section>

        {/* 4. From the field */}
        <section id={`${ids}-field`}>
          <Panel title="4. From the field">
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
              This is the part only you can write, and the AI never invents it. Jot the real story in rough notes (anonymise the client); the draft shapes it into 100–150 words without adding facts.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
              {FIELD_PROMPTS.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <TextField label={`Your notes · ${fieldWords} words`} multiline rows={6} value={form.field_notes} onChange={(v) => update("field_notes", v)} max={3000} />
          </Panel>
        </section>

        {/* 5. Draft */}
        <section id={`${ids}-draft`}>
          <Panel title="5. Draft">
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
              Writes the whole article to your playbook using {selected} ticked {selected === 1 ? "source" : "sources"}
              {form.field_notes.trim() ? " and your field notes" : ". With no field notes yet, that section is left as a clearly marked placeholder"}. It saves as a draft in Content; nothing goes live.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="pill sm" disabled={isBusy || form.outline.length === 0} onClick={() => void run("draft", () => draftAction(work.id))}>
                {busy === "draft" ? "Writing…" : work.content_id ? "Redraft" : "Write the draft"}
              </button>
              {work.content_id && (
                <Link className="pill ghost sm" href={`/studio/${work.content_id}`}>
                  Open in editor
                </Link>
              )}
            </div>
            {form.outline.length === 0 && <p className="form-note" style={{ color: "var(--muted)" }}>Plan the outline first.</p>}
          </Panel>
        </section>

        {/* 6. Fact-check */}
        <section id={`${ids}-check`}>
          <Panel
            title="6. Fact-check"
            action={
              <button type="button" className="pill sm" disabled={isBusy || !work.content_id} onClick={() => void run("check", () => checkAction(work.id))}>
                {busy === "check" ? "Checking…" : check ? "Check again" : "Fact-check the draft"}
              </button>
            }
          >
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
              Checks the latest version in the editor: every figure against your sources, the length, your story, the voice and the political guardrails. It also scores the copy against the evidence on what makes writing land.
            </p>
            {!check ? (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 15 }}>{work.content_id ? "Not checked yet." : "Write the draft first."}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge ok={check.within_length} text={`${check.word_count} words ${check.within_length ? "(within 600–900)" : "(aim for 600–900)"}`} />
                  <Badge ok={check.has_field_story} text={check.has_field_story ? "Has your field story" : "Missing your field story"} />
                  <Badge ok={!check.claims.some((c) => c.status === "unsourced" || c.status === "mismatch")} text={`${check.claims.filter((c) => c.status === "unsourced" || c.status === "mismatch").length} claims to fix`} />
                  <Badge ok={check.unmatched_numbers.length === 0} text={check.unmatched_numbers.length ? `${check.unmatched_numbers.length} figures in no source` : "Every figure appears in a source"} />
                </div>
                {check.unmatched_numbers.length > 0 && (
                  <p role="alert" className="form-note" data-tone="error">
                    These figures don’t appear in any ticked source: {check.unmatched_numbers.join(", ")}. Source them, reword them as your own experience, or cut them.
                  </p>
                )}
                {check.verdict && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{check.verdict}</p>}
                {check.claims.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
                      <caption className="sr-only">Claims and their sources</caption>
                      <thead>
                        <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 13 }}>
                          <th scope="col" style={{ padding: "8px 8px 8px 0", fontWeight: 500 }}>
                            Claim
                          </th>
                          <th scope="col" style={{ padding: 8, fontWeight: 500 }}>
                            Status
                          </th>
                          <th scope="col" style={{ padding: 8, fontWeight: 500 }}>
                            Note
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {check.claims.map((c, i) => {
                          const st = CLAIM_STYLE[c.status];
                          return (
                            <tr key={i} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
                              <td style={{ padding: "10px 8px 10px 0", lineHeight: 1.45 }}>{c.claim}</td>
                              <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                                <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: st.bg, color: st.fg }}>{st.label}</span>
                              </td>
                              <td style={{ padding: 8, lineHeight: 1.45, color: "var(--muted)" }}>
                                {c.note}
                                {c.source_url && (
                                  <>
                                    {" "}
                                    <a href={c.source_url} target="_blank" rel="noopener noreferrer">
                                      Source
                                    </a>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {[...check.voice_issues.map((v) => ["Voice", v] as const), ...check.guardrail_issues.map((v) => ["Guardrail", v] as const)].length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
                    {check.voice_issues.map((v) => (
                      <li key={`v${v}`}>
                        <strong style={{ fontWeight: 600 }}>Voice:</strong> {v}
                      </li>
                    ))}
                    {check.guardrail_issues.map((v) => (
                      <li key={`g${v}`}>
                        <strong style={{ fontWeight: 600 }}>Guardrail:</strong> {v}
                      </li>
                    ))}
                  </ul>
                )}
                <section aria-labelledby={`${ids}-score`} style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                  <h3 id={`${ids}-score`} style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                    Copy score
                  </h3>
                  <ScorePanel
                    score={check.copy_score}
                    scoring={busy === "check" || busy === "polish"}
                    onApplyAll={() => void run("polish", () => polishAction(work.id))}
                    disabled={isBusy}
                    emptyText="Run the check again to score the copy."
                  />
                  {check.copy_score && (
                    <p className="form-note" style={{ color: "var(--muted)", margin: 0 }}>
                      Applying the suggestions rewrites only what they cover, never adds figures or sources, and leaves your own story as written. Check again afterwards.
                    </p>
                  )}
                </section>
                <fieldset style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <legend style={{ fontSize: 13, color: "var(--muted)", padding: "0 6px" }}>Your quality bar (for you to tick)</legend>
                  {["No number anyone could challenge", "At least one thing only I could have written", "Comfortable with a selection panel reading it in five years"].map((q) => (
                    <label key={q} className="check-label">
                      <input type="checkbox" className="checkbox" /> {q}
                    </label>
                  ))}
                </fieldset>
              </div>
            )}
          </Panel>
        </section>

        {/* 7. Distribute */}
        <section id={`${ids}-distribute`}>
          <Panel title="7. Distribute">
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
              Creates five posts in your library: the headline statistic, a contrarian line, a practical tip, a question and a link post. Each is scored, and any that score low are improved automatically. The link post is planned for launch day and the rest across the next two weeks.
            </p>
            <button type="button" className="pill sm" style={{ alignSelf: "flex-start" }} disabled={isBusy || !work.content_id} onClick={() => void distribute()}>
              {busy === "distribute" ? "Writing and scoring posts…" : work.distributed.length ? "Create another set" : "Create the five posts"}
            </button>
            {work.distributed.length > 0 && posts.length === 0 && (
              <p className="form-note" style={{ color: "var(--muted)" }}>
                {work.distributed.length} posts created so far. <Link href="/studio/posts">Open the Posts library</Link>.
              </p>
            )}
            {posts.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
                {posts.map((p) => (
                  <li key={p.id}>
                    <Link href={`/studio/posts/${p.id}`}>{p.role?.replace("_", " ")}</Link>
                    {p.score && <span style={{ color: "var(--muted)" }}> · scores {p.score.total}{p.score.revised ? " (improved automatically)" : ""}</span>}
                    {p.planned_for && <span style={{ color: "var(--muted)" }}> · {new Date(p.planned_for).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {confirmDelete ? (
            <>
              <button type="button" className="pill danger sm" disabled={isBusy} onClick={() => void remove()}>
                Delete this plan
              </button>
              <button type="button" className="pill ghost sm" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <span role="alert" className="form-note" data-tone="error">
                Deletes the plan and its sources. Any draft stays in Content.
              </span>
            </>
          ) : (
            <button type="button" className="pill danger sm" disabled={isBusy} onClick={() => setConfirmDelete(true)}>
              Delete plan
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div className="toast" role={toast.tone === "error" ? "alert" : "status"} style={{ background: toast.tone === "error" ? "var(--danger)" : "var(--ink)", maxWidth: "calc(100vw - 32px)" }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return <span style={{ fontSize: 13, padding: "4px 10px", borderRadius: 999, background: ok ? "#E6F2EA" : "#FBE9E4", color: ok ? "var(--success)" : "var(--danger)" }}>{text}</span>;
}
