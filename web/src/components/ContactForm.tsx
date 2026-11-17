"use client";

import { useActionState } from "react";

import { contactAction } from "@/app/actions";

const TOPICS = ["Speaking", "Advisory", "Media", "Something else"] as const;

export function ContactForm() {
  const [state, action, pending] = useActionState(contactAction, null);
  const err = state?.ok === false ? state : null;
  const invalid = (f: string) => (err?.field === f ? true : undefined);

  if (state?.ok) {
    return (
      <div role="status" style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
        <span className="display" style={{ fontSize: 28 }}>
          Message sent
        </span>
        <p className="form-note" data-tone="success" style={{ fontSize: 16 }}>
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={action} aria-label="Contact form" className="stack-sm" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 14 }} noValidate>
      <label className="field">
        Name
        <input className="input" name="name" type="text" autoComplete="name" required maxLength={120} aria-invalid={invalid("name")} disabled={pending} />
      </label>
      <label className="field">
        Email
        <input className="input" name="email" type="email" autoComplete="email" required aria-invalid={invalid("email")} disabled={pending} />
      </label>
      <label className="field" style={{ gridColumn: "1 / -1" }}>
        Topic
        <select className="input select-brand" name="topic" required defaultValue="" aria-invalid={invalid("topic")} disabled={pending}>
          <option value="" disabled>
            Please select
          </option>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="field" style={{ gridColumn: "1 / -1" }}>
        Message
        <textarea className="input" name="message" rows={5} required minLength={10} maxLength={5000} aria-invalid={invalid("message")} disabled={pending} />
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>
          Company <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button type="submit" className="pill" style={{ minHeight: 48, padding: "0 26px" }} disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </button>
        <p role="status" aria-live="polite" className="form-note" data-tone={err ? "error" : undefined}>
          {err?.error ?? ""}
        </p>
      </div>
    </form>
  );
}
