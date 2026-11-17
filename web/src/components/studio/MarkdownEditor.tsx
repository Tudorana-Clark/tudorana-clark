"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo, useRef, useState } from "react";

import { useUpload } from "./useUpload";

/** Markdown body with Write / Preview tabs, image upload (button, paste or drop) and a word count. */
export function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, busy, error, accept } = useUpload();

  const preview = useMemo(() => (tab === "preview" ? DOMPurify.sanitize(marked.parse(value, { async: false })) : ""), [tab, value]);
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  function insert(text: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function handleFiles(files: FileList | File[] | null) {
    const file = files?.[0];
    if (!file) return;
    const url = await upload(file);
    if (url) insert(file.type === "application/pdf" ? `[${file.name}](${url})` : `\n![Describe this image](${url})\n`);
  }

  const wrap = (before: string, after = before) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    onChange(value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, e + before.length);
    });
  };

  return (
    <div style={{ background: "var(--white)", borderRadius: 20, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
        <div role="tablist" aria-label="Editor mode" style={{ display: "flex", gap: 4 }}>
          {(["write", "preview"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className="chip" onClick={() => setTab(t)} style={{ minHeight: 36 }}>
              {t === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        {tab === "write" && (
          <div role="toolbar" aria-label="Formatting" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <ToolButton label="Heading" onClick={() => insert("\n## ")}>
              H2
            </ToolButton>
            <ToolButton label="Bold" onClick={() => wrap("**")}>
              <b>B</b>
            </ToolButton>
            <ToolButton label="Italic" onClick={() => wrap("_")}>
              <i>I</i>
            </ToolButton>
            <ToolButton label="Link" onClick={() => wrap("[", "](https://)")}>
              Link
            </ToolButton>
            <ToolButton label="Quote" onClick={() => insert("\n> ")}>
              Quote
            </ToolButton>
            <ToolButton label="Bulleted list" onClick={() => insert("\n- ")}>
              List
            </ToolButton>
            <ToolButton label="Insert image or PDF" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "Uploading…" : "Image"}
            </ToolButton>
            <input ref={fileRef} type="file" accept={accept} hidden onChange={(e) => void handleFiles(e.target.files).finally(() => (e.target.value = ""))} />
          </div>
        )}
      </div>
      {tab === "write" ? (
        <textarea
          ref={ref}
          aria-label="Body (Markdown)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              void handleFiles(files);
            }
          }}
          onDrop={(e) => {
            if (e.dataTransfer.files.length) {
              e.preventDefault();
              void handleFiles(e.dataTransfer.files);
            }
          }}
          placeholder={"Start writing. Markdown works: ## headings, **bold**, > quotes, - lists.\n\nPaste or drop images straight in."}
          style={{ width: "100%", minHeight: 520, border: 0, padding: 24, fontSize: 17, lineHeight: 1.7, resize: "vertical", fontFamily: "var(--font-body)", color: "var(--ink)", outline: "none" }}
        />
      ) : (
        <div className="prose" style={{ margin: 0, padding: 24, maxWidth: "none", minHeight: 520 }} dangerouslySetInnerHTML={{ __html: preview || "<p style='color:var(--muted)'>Nothing to preview yet.</p>" }} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--muted)" }}>
        <span role="status" aria-live="polite" style={{ color: error ? "var(--danger)" : undefined }}>
          {error ?? (busy ? "Uploading…" : "")}
        </span>
        <span>
          {words.toLocaleString("en-GB")} words
        </span>
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="chip" aria-label={label} title={label} onClick={onClick} disabled={disabled} style={{ minHeight: 36, padding: "0 12px", fontSize: 13 }}>
      {children}
    </button>
  );
}
