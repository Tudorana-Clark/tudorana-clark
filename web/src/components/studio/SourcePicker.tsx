"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { listSourcesAction } from "@/app/studio/library-actions";
import type { ArticleSource, LibrarySource, OutlineSection } from "@/lib/types";

import { FreshnessPill, LinkPill, sourceByline } from "./SourceBits";

/** Pull evidence from the library into an article plan, one finding at a time. */
export function SourcePicker({ open, onClose, onAdd, sections, alreadyAdded, initialQuery }: { open: boolean; onClose: () => void; onAdd: (s: ArticleSource) => void; sections: OutlineSection[]; alreadyAdded: Set<string>; initialQuery: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<LibrarySource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const ids = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQuery(initialQuery);
      setError(null);
      void listSourcesAction().then((res) => (res.ok ? setItems(res.data) : setError(res.error)));
    } else if (!open && d.open) d.close();
  }, [open, initialQuery]);

  const shown = useMemo(() => {
    if (!items) return [];
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const score = (s: LibrarySource) => {
      const hay = [s.title, s.publisher, ...s.findings.map((f) => f.text), ...s.themes].join(" ").toLowerCase();
      return words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
    };
    return items
      .map((s) => ({ s, n: score(s) }))
      .filter((x) => !words.length || x.n > 0)
      .sort((a, b) => b.n - a.n || (b.s.published_on ?? "").localeCompare(a.s.published_on ?? ""))
      .map((x) => x.s)
      .slice(0, 50);
  }, [items, query]);

  function add(s: LibrarySource, finding: string) {
    // Stable id per source + finding, so the same finding can't be added twice under different ids.
    let h = 0;
    for (const ch of finding) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    onAdd({ id: `lib-${s.id.slice(0, 12)}-${(h >>> 0).toString(36)}`, title: s.title, publisher: s.publisher, url: s.url, published: s.published, sponsor: s.sponsor, finding, section, selected: true, added_by: "author" });
  }

  return (
    <dialog ref={ref} className="dialog" style={{ width: "min(760px, calc(100vw - 32px))" }} aria-labelledby={`${ids}-t`} onClose={onClose} onCancel={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 id={`${ids}-t`} className="display" style={{ fontSize: 24, margin: 0 }}>
              Add from your library
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted)" }}>Pick the findings to use. Older sources are marked so you can prefer fresh ones.</p>
          </div>
          <button type="button" className="pill ghost sm" onClick={onClose} aria-label="Close library">
            Done
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label htmlFor={`${ids}-q`} className="sr-only">
            Search the library
          </label>
          <input id={`${ids}-q`} className="input" style={{ flex: 1, minWidth: 220 }} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the library" />
          <label htmlFor={`${ids}-s`} className="sr-only">
            Section to add to
          </label>
          <select id={`${ids}-s`} className="input select-brand" data-empty="choice" style={{ maxWidth: 220 }} value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">General</option>
            {sections.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div aria-live="polite" aria-busy={items === null && !error} style={{ maxHeight: "55vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {error && (
            <p role="alert" className="form-note" data-tone="error">
              {error}
            </p>
          )}
          {items === null && !error && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
          {items && shown.length === 0 && <p style={{ margin: 0, color: "var(--muted)" }}>{items.length ? "Nothing matches that search." : "Your library is empty. Import research on the Sources page."}</p>}
          {shown.map((s) => (
            <div key={s.id} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
                {sourceByline(s)}
                <FreshnessPill published_on={s.published_on} />
                {s.link_status === "broken" && <LinkPill status="broken" />}
              </span>
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15, fontWeight: 500, overflowWrap: "anywhere" }}>
                {s.title}
              </a>
              {(s.findings.length ? s.findings.map((f) => f.text) : [""]).map((f) => {
                const key = `${s.url}|${f}`;
                const added = alreadyAdded.has(key);
                return (
                  <div key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, lineHeight: 1.5 }}>{f || <span style={{ color: "var(--muted)" }}>No finding recorded: add the source itself.</span>}</span>
                    <button type="button" className="pill ghost sm" disabled={added} onClick={() => add(s, f)} aria-label={`Add ${f ? `finding: ${f.slice(0, 60)}` : s.title}`}>
                      {added ? "Added" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
