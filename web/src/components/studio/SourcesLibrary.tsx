"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";

import { checkSourceAction, checkSourcesAction, deleteSourceAction, listSourcesAction, updateSourceAction } from "@/app/studio/library-actions";
import { freshness, type LibrarySource } from "@/lib/types";

import { ImportDialog } from "./ImportDialog";
import { FreshnessPill, LinkPill, sourceByline } from "./SourceBits";

type Filter = "all" | "fresh" | "stale" | "broken";
type Toast = { tone: "success" | "error"; text: string } | null;

/** The evidence bank: search, filter by theme and freshness, keep links healthy, import more. */
export function SourcesLibrary({ initial, loadError }: { initial: LibrarySource[]; loadError: string | null }) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(loadError ? { tone: "error", text: loadError } : null);
  const [checking, setChecking] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchId = useId();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "error" ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const themes = useMemo(() => [...new Set(items.flatMap((s) => s.themes))].sort(), [items]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((s) => !theme || s.themes.includes(theme))
      .filter((s) => {
        const f = freshness(s.published_on);
        return filter === "all" || (filter === "fresh" && (f === "fresh" || f === "ageing")) || (filter === "stale" && (f === "stale" || f === "undated")) || (filter === "broken" && s.link_status === "broken");
      })
      .filter((s) => !q || [s.title, s.publisher, s.sponsor, s.notes, ...s.findings.map((f) => f.text), ...s.themes].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (b.published_on ?? "").localeCompare(a.published_on ?? "") || b.updated_at.localeCompare(a.updated_at));
  }, [items, query, theme, filter]);

  const replace = (s: LibrarySource) => setItems((list) => list.map((x) => (x.id === s.id ? s : x)));

  async function refresh() {
    const res = await listSourcesAction();
    if (res.ok) setItems(res.data);
  }

  async function check(id: string) {
    setChecking(id);
    const res = await checkSourceAction(id);
    setChecking(null);
    if (!res.ok) return setToast({ tone: "error", text: res.error });
    replace(res.data);
    setToast({ tone: res.data.link_status === "broken" ? "error" : "success", text: res.message ?? "Checked." });
  }

  async function checkAll() {
    setChecking("all");
    const res = await checkSourcesAction();
    setChecking(null);
    if (!res.ok) return setToast({ tone: "error", text: res.error });
    res.data.forEach(replace);
    setToast({ tone: "success", text: res.message ?? "Checked." });
  }

  function removeTheme(s: LibrarySource, t: string) {
    startTransition(async () => {
      const { url, title, publisher, published, sponsor, findings, themes: th, notes } = s;
      const res = await updateSourceAction(s.id, { url, title, publisher, published, sponsor, findings, themes: th.filter((x) => x !== t), notes });
      if (!res.ok) return setToast({ tone: "error", text: res.error });
      replace(res.data);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteSourceAction(id);
      if (!res.ok) return setToast({ tone: "error", text: res.error });
      setItems((list) => list.filter((x) => x.id !== id));
      setConfirmDelete(null);
      setToast({ tone: "success", text: res.message ?? "Removed." });
    });
  }

  const counts = {
    all: items.length,
    fresh: items.filter((s) => ["fresh", "ageing"].includes(freshness(s.published_on))).length,
    stale: items.filter((s) => ["stale", "undated"].includes(freshness(s.published_on))).length,
    broken: items.filter((s) => s.link_status === "broken").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="display" style={{ fontSize: 40 }}>
            Sources
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 15 }}>Your evidence bank. Import research from Claude; article research adds to it automatically.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="pill ghost sm" onClick={() => void checkAll()} disabled={checking !== null || items.length === 0}>
            {checking === "all" ? "Checking links…" : "Check links"}
          </button>
          <button type="button" className="pill sm" onClick={() => setImportOpen(true)}>
            Import research
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label htmlFor={searchId} className="sr-only">
          Search sources
        </label>
        <input id={searchId} className="input" style={{ maxWidth: 360 }} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search publishers, titles and findings" />
        <div role="group" aria-label="Filter by freshness" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              ["all", "All"],
              ["fresh", "Within a year"],
              ["stale", "Old or undated"],
              ["broken", "Broken links"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l} · {counts[k]}
            </button>
          ))}
        </div>
      </div>
      {themes.length > 0 && (
        <div role="group" aria-label="Filter by theme" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {themes.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={theme === t} onClick={() => setTheme(theme === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      <section aria-label="Sources" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.length === 0 ? (
          <div style={{ background: "var(--white)", borderRadius: 24, padding: 32, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <span className="display" style={{ fontSize: 22 }}>
              {items.length ? "Nothing matches" : "Start your evidence bank"}
            </span>
            <p style={{ margin: 0, color: "var(--muted)" }}>{items.length ? "Try another search or filter." : "Paste a research report from Claude. Every source it cites, with its figures and date, is saved here for future articles and posts."}</p>
            {!items.length && (
              <button type="button" className="pill sm" onClick={() => setImportOpen(true)}>
                Import research
              </button>
            )}
          </div>
        ) : (
          shown.map((s) => (
            <article key={s.id} style={{ background: "var(--white)", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
                <span>{sourceByline(s)}</span>
                <FreshnessPill published_on={s.published_on} />
                <LinkPill status={s.link_status} />
              </div>
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 17, fontWeight: 500, overflowWrap: "anywhere" }}>
                {s.title}
              </a>
              {s.findings.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.55 }}>
                  {s.findings.map((f) => (
                    <li key={f.text}>{f.text}</li>
                  ))}
                </ul>
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {s.themes.map((t) => (
                  <span key={t} className="tag-chip" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "3px 4px 3px 10px", borderRadius: 999, background: "var(--card)" }}>
                    {t}
                    <button type="button" className="tag-remove" onClick={() => removeTheme(s, t)} disabled={pending} aria-label={`Remove theme ${t}`}>
                      ×
                    </button>
                  </span>
                ))}
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {[s.imported_from, s.used_in.length ? `used in ${s.used_in.length} ${s.used_in.length === 1 ? "article" : "articles"}` : ""].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="pill ghost sm" onClick={() => void check(s.id)} disabled={checking !== null}>
                  {checking === s.id ? "Checking…" : "Check link"}
                </button>
                {confirmDelete === s.id ? (
                  <>
                    <button type="button" className="pill danger sm" onClick={() => remove(s.id)} disabled={pending}>
                      Remove permanently
                    </button>
                    <button type="button" className="pill ghost sm" onClick={() => setConfirmDelete(null)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button type="button" className="pill ghost sm" onClick={() => setConfirmDelete(s.id)}>
                    Remove
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={(message) => {
          setImportOpen(false);
          setToast({ tone: "success", text: message });
          void refresh();
        }}
      />

      {toast && (
        <div className="toast" role={toast.tone === "error" ? "alert" : "status"} style={{ background: toast.tone === "error" ? "var(--danger)" : "var(--ink)", maxWidth: "calc(100vw - 32px)" }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
