"use client";

import { useId, useRef, useState } from "react";

export interface TagSuggestions {
  /** Tags on the most recently edited content, newest first. */
  recent: string[];
  /** Every tag used before, most-used first. */
  used: { tag: string; count: number }[];
}

const MAX_TAGS = 12;
const MAX_LEN = 40;

/**
 * Tag bubbles: chosen tags as removable chips, plus "Recent" and "Used before" bubbles to add in
 * one click. Type and press Enter or comma to add a new tag; Backspace on an empty field removes the last.
 */
export function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (tags: string[]) => void; suggestions: TagSuggestions }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");

  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const full = value.length >= MAX_TAGS;

  /** Add one or more tags in a single update (pasting "a, b, c" must not drop any). */
  function add(...raws: string[]) {
    const next = [...value];
    const added: string[] = [];
    let problem = "";
    for (const raw of raws) {
      const tag = raw.trim().replace(/\s+/g, " ").slice(0, MAX_LEN);
      if (!tag) continue;
      if (next.some((v) => v.toLowerCase() === tag.toLowerCase())) {
        problem = `“${tag}” is already added.`;
        continue;
      }
      if (next.length >= MAX_TAGS) {
        problem = `You can add up to ${MAX_TAGS} tags.`;
        break;
      }
      // Reuse the existing spelling/casing so "ai adoption" doesn't become a new tag.
      const known = [...suggestions.recent, ...suggestions.used.map((u) => u.tag)].find((k) => k.toLowerCase() === tag.toLowerCase());
      next.push(known ?? tag);
      added.push(known ?? tag);
    }
    if (added.length) onChange(next);
    setNote(added.length ? `Added ${added.map((t) => `“${t}”`).join(", ")}.` : problem);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
    setNote(`Removed “${tag}”.`);
    inputRef.current?.focus();
  }

  const q = draft.trim().toLowerCase();
  const match = (t: string) => !has(t) && (!q || t.toLowerCase().includes(q));
  const recent = suggestions.recent.filter(match).slice(0, 6);
  const used = suggestions.used.filter((u) => match(u.tag) && !recent.includes(u.tag)).slice(0, 12);

  return (
    <div className="field">
      <label htmlFor={id}>Tags</label>
      <div className="tag-box" onClick={() => inputRef.current?.focus()}>
        <ul aria-label="Selected tags" style={{ display: "contents" }}>
          {value.map((t) => (
            <li key={t} className="tag-chip" style={{ listStyle: "none" }}>
              {t}
              <button type="button" className="tag-remove" aria-label={`Remove tag ${t}`} onClick={() => remove(t)}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={inputRef}
          id={id}
          value={draft}
          disabled={full}
          maxLength={MAX_LEN}
          placeholder={full ? "Tag limit reached" : value.length ? "Add another…" : "Type a tag and press Enter"}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) {
              const parts = v.split(",");
              add(...parts.slice(0, -1));
              setDraft(parts.at(-1) ?? "");
            } else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
        />
      </div>
      <span id={`${id}-hint`} style={{ fontSize: 12 }}>
        Enter or comma to add · {value.length}/{MAX_TAGS}
      </span>

      {(recent.length > 0 || used.length > 0) && !full && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {recent.length > 0 && <SuggestionRow title="Recent" tags={recent} onAdd={add} />}
          {used.length > 0 && <SuggestionRow title={q ? "Matching tags" : "Used before"} tags={used.map((u) => u.tag)} counts={Object.fromEntries(used.map((u) => [u.tag, u.count]))} onAdd={add} />}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {note}
      </span>
    </div>
  );
}

function SuggestionRow({ title, tags, counts, onAdd }: { title: string; tags: string[]; counts?: Record<string, number>; onAdd: (t: string) => void }) {
  return (
    <div role="group" aria-label={`${title} tags`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12 }}>{title}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tags.map((t) => (
          <button key={t} type="button" className="tag-suggest" aria-label={`Add tag ${t}`} onClick={() => onAdd(t)}>
            <span aria-hidden="true">+</span> {t}
            {counts?.[t] ? <span className="tag-count">{counts[t]}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
