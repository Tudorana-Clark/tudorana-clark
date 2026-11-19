"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { deleteContentAction, generateSeoAction, saveContentAction, setStatusAction } from "@/app/studio/actions";
import { KIND_LABEL, pathFor } from "@/lib/content";
import { type Content, type ContentInput, KINDS, type SocialCopy } from "@/lib/types";

import { CoverGenerator } from "./CoverGenerator";
import { DatePicker } from "./DatePicker";
import { LinesField, Panel, TextField } from "./fields";
import { MarkdownEditor } from "./MarkdownEditor";
import { SerpPreview, SocialCardPreview } from "./Previews";
import { StatusBadge } from "./StatusBadge";
import { TagInput, type TagSuggestions } from "./TagInput";
import { useUpload } from "./useUpload";

type Toast = { tone: "success" | "error"; text: string } | null;

function toInput(c: Content): ContentInput {
  const { kind, title, slug, subtitle, excerpt, body, category, tags, feature_image, cover, featured, seo, social, event, video, research } = c;
  return { kind, title, slug, subtitle, excerpt, body, category, tags, feature_image, cover: cover ?? null, featured, seo, social, event, video, research };
}

const SOCIAL: { key: keyof SocialCopy; label: string; max: number; share?: (text: string, url: string) => string }[] = [
  { key: "linkedin", label: "LinkedIn", max: 3000, share: (_t, u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  { key: "x", label: "X", max: 280, share: (t, u) => `https://x.com/intent/post?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { key: "facebook", label: "Facebook", max: 2000, share: (_t, u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { key: "threads", label: "Threads", max: 500, share: (t, u) => `https://www.threads.net/intent/post?text=${encodeURIComponent(`${t} ${u}`)}` },
  { key: "bluesky", label: "Bluesky", max: 300, share: (t, u) => `https://bsky.app/intent/compose?text=${encodeURIComponent(`${t} ${u}`)}` },
];

export function Editor({ initial, siteUrl, tagSuggestions }: { initial: Content | ContentInput; siteUrl: string; tagSuggestions: TagSuggestions }) {
  const router = useRouter();
  const saved = "id" in initial ? initial : null;
  const [doc, setDoc] = useState<Content | null>(saved);
  const [form, setForm] = useState<ContentInput>(saved ? toInput(saved) : initial);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [aiBusy, setAiBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const feature = useUpload();
  const pdf = useUpload();
  const featureInput = useRef<HTMLInputElement>(null);

  const update = useCallback(<K extends keyof ContentInput>(key: K, value: ContentInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }, []);
  const updateSeo = <K extends keyof ContentInput["seo"]>(key: K, value: ContentInput["seo"][K]) => update("seo", { ...form.seo, [key]: value });
  const updateSocial = (key: keyof SocialCopy, value: string) => update("social", { ...form.social, [key]: value });

  // Warn before leaving with unsaved changes.
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

  const isLive = doc?.status === "published";
  const livePath = doc ? pathFor(doc) : pathFor({ kind: form.kind, slug: form.slug || "your-address" });
  const liveUrl = `${siteUrl}${livePath}`;

  async function generate(silent = false): Promise<ContentInput | null> {
    setAiBusy(true);
    try {
      const res = await generateSeoAction({ kind: form.kind, title: form.title, body: form.body, category: form.category });
      if (!res.ok) {
        if (!silent) setToast({ tone: "error", text: res.error });
        return null;
      }
      const s = res.data;
      const next: ContentInput = {
        ...form,
        seo: s.seo,
        social: s.social,
        excerpt: form.excerpt || s.excerpt,
        tags: form.tags.length ? form.tags : s.tags,
        slug: form.slug || (doc ? form.slug : s.slug),
        feature_image: form.feature_image && !form.feature_image.alt ? { ...form.feature_image, alt: s.image_alt_hint } : form.feature_image,
      };
      setForm(next);
      setDirty(true);
      if (!silent) setToast({ tone: "success", text: res.message ?? "Suggestions added." });
      return next;
    } finally {
      setAiBusy(false);
    }
  }

  function save(publish: boolean) {
    startTransition(async () => {
      let input = form;
      // Seamless publishing: if SEO was never generated, do it now so nothing ships without it.
      if (publish && !form.seo.meta_description && form.body.trim().split(/\s+/).length >= 40) {
        input = (await generate(true)) ?? form;
      }
      const res = await saveContentAction(doc?.id ?? null, input, publish);
      if (!res.ok) {
        setErrorField(res.field ?? null);
        setToast({ tone: "error", text: res.error });
        return;
      }
      setErrorField(null);
      setDoc(res.data);
      setForm(toInput(res.data));
      setDirty(false);
      setToast({ tone: "success", text: res.message ?? "Saved." });
      if (!doc) router.replace(`/studio/${res.data.id}`);
    });
  }

  function changeStatus(status: "publish" | "unpublish") {
    if (!doc) return;
    startTransition(async () => {
      const res = await setStatusAction(doc.id, status);
      if (!res.ok) return setToast({ tone: "error", text: res.error });
      setDoc(res.data);
      setToast({ tone: "success", text: res.message ?? "Done." });
    });
  }

  function remove() {
    if (!doc) return;
    startTransition(async () => {
      const res = await deleteContentAction(doc.id);
      if (res && !res.ok) setToast({ tone: "error", text: res.error });
    });
  }

  // Cmd/Ctrl+S saves (scoped to the editor; doesn't hijack typing elsewhere).
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function onFeature(file: File | undefined) {
    if (!file) return;
    const url = await feature.upload(file);
    if (!url) return;
    // A real photo replaces any AI cover; don't carry the AI alt text or provenance over.
    setForm((f) => ({ ...f, feature_image: { url, alt: f.cover ? "" : (f.feature_image?.alt ?? "") }, cover: null }));
    setDirty(true);
  }

  const busy = pending || aiBusy;
  const metaTitle = form.seo.meta_title || form.title;
  const metaDesc = form.seo.meta_description || form.excerpt;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 5, background: "var(--card)", padding: "12px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <StatusBadge status={doc?.status ?? "draft"} />
          <span style={{ fontSize: 13, color: "var(--muted)" }} aria-live="polite">
            {pending ? "Saving…" : aiBusy ? "AI is drafting SEO and social copy…" : dirty ? "Unsaved changes" : doc ? "All changes saved" : "New draft"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isLive && doc && (
            <a className="pill ghost sm" href={`/studio/posts/new?from=${doc.id}`}>
              Make a post
            </a>
          )}
          {isLive && (
            <a className="pill ghost sm" href={livePath} target="_blank" rel="noopener">
              View live
            </a>
          )}
          <button type="button" className="pill ghost sm" onClick={() => save(false)} disabled={busy || (!dirty && !!doc)}>
            {isLive ? "Save" : "Save draft"}
          </button>
          {isLive ? (
            <button type="button" className="pill sm" onClick={() => save(true)} disabled={busy || !dirty}>
              Update live
            </button>
          ) : (
            <button type="button" className="pill sm" onClick={() => save(true)} disabled={busy || !form.title.trim()}>
              {pending ? "Publishing…" : "Publish"}
            </button>
          )}
        </div>
      </div>

      <div className="studio-split wide-main">
        {/* Main column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div role="radiogroup" aria-label="Content type" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={form.kind === k}
                className="chip"
                onClick={() => {
                  update("kind", k);
                  if ((k === "talk" || k === "video") && !form.event) update("event", { name: "", date: new Date().toISOString().slice(0, 10), location: "", url: null });
                }}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="title">
            Title
          </label>
          <textarea
            id="title"
            rows={1}
            value={form.title}
            onChange={(e) => update("title", e.target.value.replace(/\n/g, ""))}
            placeholder="Title"
            className="display"
            aria-invalid={errorField === "title" ? true : undefined}
            style={{ fontSize: 44, lineHeight: 1.08, border: 0, background: "transparent", resize: "none", outline: "none", padding: "0 0 4px", color: "var(--ink)", fieldSizing: "content" } as React.CSSProperties}
          />
          <TextField label="Subtitle (optional)" value={form.subtitle} onChange={(v) => update("subtitle", v)} max={300} />
          <MarkdownEditor value={form.body} onChange={(v) => update("body", v)} />

          {/* AI SEO */}
          <Panel
            title="AI SEO & answer-engine pack"
            action={
              <button type="button" className="pill sm" onClick={() => void generate()} disabled={busy}>
                {aiBusy ? "Generating…" : form.seo.meta_description ? "Regenerate" : "Generate with AI"}
              </button>
            }
          >
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>Meta tags for Google and Bing, plus a quotable summary, takeaways and FAQ that ChatGPT, Copilot, Perplexity and Claude can cite. All of it ships as schema.org structured data, llms.txt and a Markdown twin.</p>
            <div className="g2">
              <SerpPreview url={liveUrl} title={metaTitle} description={metaDesc} />
              <SocialCardPreview domain={new URL(siteUrl).host} title={metaTitle} description={metaDesc} image={form.feature_image?.url ?? null} />
            </div>
            <TextField label="Meta title" value={form.seo.meta_title} onChange={(v) => updateSeo("meta_title", v)} max={70} ideal={[45, 60]} placeholder={form.title} invalid={errorField === "seo.meta_title"} />
            <TextField label="Meta description" multiline rows={2} value={form.seo.meta_description} onChange={(v) => updateSeo("meta_description", v)} max={170} ideal={[130, 158]} invalid={errorField === "seo.meta_description"} />
            <TextField label="In short (TL;DR shown at the top and quoted by AI assistants)" multiline rows={3} value={form.seo.tldr} onChange={(v) => updateSeo("tldr", v)} max={600} />
            <LinesField label="Key takeaways" value={form.seo.key_takeaways} onChange={(v) => updateSeo("key_takeaways", v)} />
            <div className="g2">
              <LinesField label="Search keywords" value={form.seo.keywords} onChange={(v) => updateSeo("keywords", v)} rows={4} />
              <LinesField label="Entities (people, orgs, concepts)" value={form.seo.entities} onChange={(v) => updateSeo("entities", v)} rows={4} />
            </div>
            <FaqEditor value={form.seo.faq} onChange={(v) => updateSeo("faq", v)} />
          </Panel>

          {/* Social */}
          <Panel title="Social posts">
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>Platform-tuned copy. Every share link is UTM-tagged and opens with a branded 1200×630 card.</p>
            {SOCIAL.map((s) => (
              <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <TextField label={s.label} multiline rows={s.key === "linkedin" ? 6 : 3} value={form.social[s.key]} onChange={(v) => updateSocial(s.key, v)} max={s.max} invalid={errorField === `social.${s.key}`} />
                <div style={{ display: "flex", gap: 8 }}>
                  <CopyButton text={form.social[s.key]} label={`Copy ${s.label} post`} />
                  {isLive && s.share && (
                    <a className="pill ghost sm" target="_blank" rel="noopener noreferrer" href={s.share(form.social[s.key], `${liveUrl}?utm_source=${s.key}&utm_medium=social`)}>
                      Post to {s.label}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </Panel>
        </div>

        {/* Sidebar */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 72 }}>
          <Panel title="Feature image">
            {form.feature_image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.feature_image.url} alt={form.feature_image.alt} style={{ borderRadius: 14, aspectRatio: "16 / 9", objectFit: "cover", width: "100%" }} />
                <TextField label="Alt text (describe the image)" value={form.feature_image.alt} onChange={(v) => update("feature_image", { ...form.feature_image!, alt: v })} max={300} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="pill ghost sm" onClick={() => featureInput.current?.click()} disabled={feature.busy}>
                    Replace
                  </button>
                  <button
                    type="button"
                    className="pill ghost sm"
                    onClick={() => {
                      setForm((f) => ({ ...f, feature_image: null, cover: null }));
                      setDirty(true);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => featureInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void onFeature(e.dataTransfer.files[0]);
                }}
                disabled={feature.busy}
                style={{ aspectRatio: "16 / 9", borderRadius: 14, border: "1px dashed #c9c9c2", background: "var(--card)", color: "var(--muted)", cursor: "pointer", fontSize: 14 }}
              >
                {feature.busy ? "Uploading…" : "Drop an image or click to upload"}
              </button>
            )}
            <input ref={featureInput} type="file" accept="image/png,image/jpeg,image/webp,image/avif" hidden onChange={(e) => void onFeature(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
            {feature.error && (
              <p role="alert" className="form-note" data-tone="error">
                {feature.error}
              </p>
            )}
            {form.cover && (
              <p className="form-note" style={{ color: "var(--muted)" }}>
                AI cover · style {form.cover.style_version}
              </p>
            )}
            <CoverGenerator
              form={form}
              selectedUrl={form.feature_image?.url ?? null}
              onPick={(image, cover) => {
                setForm((f) => ({ ...f, feature_image: image, cover }));
                setDirty(true);
              }}
            />
          </Panel>

          <Panel title="Details">
            <TextField label="Web address" value={form.slug ?? ""} onChange={(v) => update("slug", v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))} placeholder="generated-from-title" hint={livePath} invalid={errorField === "slug"} />
            <TextField label="Category" value={form.category} onChange={(v) => update("category", v)} placeholder="Artificial Intelligence" />
            <TagInput value={form.tags} onChange={(v) => update("tags", v)} suggestions={tagSuggestions} />
            <TextField label="Excerpt (listing cards)" multiline rows={3} value={form.excerpt} onChange={(v) => update("excerpt", v)} max={400} />
            <label className="check-label">
              <input type="checkbox" className="checkbox" checked={form.featured} onChange={(e) => update("featured", e.target.checked)} />
              Feature this piece
            </label>
          </Panel>

          {(form.kind === "talk" || form.kind === "video") && (
            <Panel title="Event">
              <TextField label="Event name" value={form.event?.name ?? ""} onChange={(v) => update("event", { ...(form.event ?? { date: "", location: "", url: null }), name: v })} invalid={errorField?.startsWith("event")} />
              <DatePicker label="Date" value={(form.event?.date ?? "").slice(0, 10)} onChange={(v) => update("event", { ...(form.event ?? { name: "", location: "", url: null }), date: v })} invalid={errorField === "event.date"} />
              <TextField label="Location" value={form.event?.location ?? ""} onChange={(v) => update("event", { ...(form.event ?? { name: "", date: "", url: null }), location: v })} />
              <TextField label="Event website" type="url" value={form.event?.url ?? ""} onChange={(v) => update("event", { ...(form.event ?? { name: "", date: "", location: "" }), url: v || null })} />
            </Panel>
          )}

          {form.kind === "video" && (
            <Panel title="Video">
              <TextField label="Embed URL" type="url" value={form.video?.embed_url ?? ""} onChange={(v) => update("video", { ...(form.video ?? {}), embed_url: v })} placeholder="https://www.youtube-nocookie.com/embed/…" invalid={errorField?.startsWith("video")} />
              <TextField label="Duration (ISO 8601)" value={form.video?.duration_iso ?? ""} onChange={(v) => update("video", { ...(form.video ?? { embed_url: "" }), duration_iso: v || null })} placeholder="PT12M30S" />
            </Panel>
          )}

          {form.kind === "research" && (
            <Panel title="Research">
              <div className="field">
                <span>Paper (PDF)</span>
                <input
                  type="file"
                  accept="application/pdf"
                  aria-label="Upload paper PDF"
                  disabled={pdf.busy}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const url = await pdf.upload(f);
                    if (url) update("research", { institution: "", citation: "", stats: [], ...form.research, pdf_url: url });
                  }}
                />
                {pdf.busy && <span>Uploading…</span>}
                {pdf.error && <span style={{ color: "var(--danger)" }}>{pdf.error}</span>}
                {form.research?.pdf_url && (
                  <a href={form.research.pdf_url} target="_blank" rel="noopener" style={{ fontSize: 13 }}>
                    Current PDF
                  </a>
                )}
              </div>
              <TextField label="Carousel URL" type="url" value={form.research?.carousel_url ?? ""} onChange={(v) => update("research", { institution: "", citation: "", stats: [], ...form.research, carousel_url: v || null })} />
              <TextField label="Institution" value={form.research?.institution ?? ""} onChange={(v) => update("research", { citation: "", stats: [], ...form.research, institution: v })} />
              <TextField label="Citation" multiline rows={3} value={form.research?.citation ?? ""} onChange={(v) => update("research", { institution: "", stats: [], ...form.research, citation: v })} max={1000} />
              <LinesField
                label="Key findings"
                hint="One per line: value | label  (e.g. 512 of 512 | task descriptors matched an independent oracle)"
                value={(form.research?.stats ?? []).map((s) => `${s.value} | ${s.label}`)}
                onChange={(lines) =>
                  update("research", {
                    institution: "",
                    citation: "",
                    ...form.research,
                    stats: lines.map((l) => {
                      const [value = "", ...rest] = l.split("|");
                      return { value: value.trim(), label: rest.join("|").trim() };
                    }),
                  })
                }
              />
            </Panel>
          )}

          {doc && (
            <Panel title="Publishing">
              <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
                {isLive ? "Live on the site. Search engines are notified automatically (IndexNow) whenever you update it." : "Only you can see this draft."}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {isLive ? (
                  <button type="button" className="pill ghost sm" onClick={() => changeStatus("unpublish")} disabled={busy}>
                    Unpublish
                  </button>
                ) : (
                  <button type="button" className="pill ghost sm" onClick={() => changeStatus("publish")} disabled={busy || dirty} title={dirty ? "Save your changes first" : undefined}>
                    Publish saved version
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
                  This removes it from the site and can’t be undone.
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

function FaqEditor({ value, onChange }: { value: { question: string; answer: string }[]; onChange: (v: { question: string; answer: string }[]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>FAQ (becomes FAQPage structured data)</span>
        <button type="button" className="pill ghost sm" onClick={() => onChange([...value, { question: "", answer: "" }])} disabled={value.length >= 8}>
          Add question
        </button>
      </div>
      {value.map((f, i) => (
        <div key={i} style={{ background: "var(--card)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <TextField label={`Question ${i + 1}`} value={f.question} onChange={(q) => onChange(value.map((x, j) => (j === i ? { ...x, question: q } : x)))} max={300} />
          <TextField label="Answer" multiline rows={3} value={f.answer} onChange={(a) => onChange(value.map((x, j) => (j === i ? { ...x, answer: a } : x)))} max={1200} />
          <button type="button" className="pill ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove question
          </button>
        </div>
      ))}
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
