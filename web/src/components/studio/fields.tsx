"use client";

import { type ReactNode, useId } from "react";

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} style={{ background: "var(--white)", borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 id={id} style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Text input / textarea with an optional live character budget (good for meta tags and posts). */
export function TextField({
  label,
  value,
  onChange,
  max,
  ideal,
  multiline,
  rows = 3,
  placeholder,
  hint,
  invalid,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  ideal?: [number, number];
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: string;
  invalid?: boolean;
  type?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const len = value.length;
  const over = max !== undefined && len > max;
  const inIdeal = ideal ? len >= ideal[0] && len <= ideal[1] : true;
  const counterColor = over ? "var(--danger)" : len === 0 || inIdeal ? "var(--muted)" : "var(--brass)";
  return (
    <div className="field">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <label htmlFor={id}>{label}</label>
        {max !== undefined && (
          <span aria-live="polite" style={{ color: counterColor, fontVariantNumeric: "tabular-nums" }}>
            {len}/{max}
            {ideal && len > 0 && !inIdeal && !over ? " · aim for " + ideal.join("–") : ""}
          </span>
        )}
      </div>
      {multiline ? (
        <textarea id={id} className="input" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={over || invalid ? true : undefined} disabled={disabled} />
      ) : (
        <input id={id} className="input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={over || invalid ? true : undefined} disabled={disabled} />
      )}
      {hint && <span style={{ fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

/** One item per line ↔ string[]. */
export function LinesField({ label, value, onChange, rows = 4, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number; hint?: string }) {
  return <TextField label={label} multiline rows={rows} hint={hint ?? "One per line"} value={value.join("\n")} onChange={(v) => onChange(v.split("\n").map((s) => s.trimStart()))} />;
}
