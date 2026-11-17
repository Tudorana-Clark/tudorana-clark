"use client";

import { useActionState, useId } from "react";

import { subscribeAction } from "@/app/actions";

export function Newsletter({ source = "site" }: { source?: string }) {
  const [state, action, pending] = useActionState(subscribeAction, null);
  const emailId = useId();
  const noteId = useId();
  const done = state?.ok === true;

  return (
    <section id="newsletter" className="wrap section-sm no-print" aria-labelledby={`${emailId}-h`}>
      <div className="on-dark pad-sm" style={{ background: "var(--ink)", color: "var(--white)", borderRadius: "var(--r-xl)", padding: 64, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 14 }}>
          <span style={{ fontSize: 13, color: "var(--gold)" }}>The newsletter</span>
          <h2 id={`${emailId}-h`} className="display h-2" style={{ fontSize: 44, lineHeight: 1.05 }}>
            Get exclusive insights directly to your email.
          </h2>
          <p style={{ margin: 0, fontSize: 15, color: "var(--on-dark)" }}>No spam. Unsubscribe in one click. Your details are never shared.</p>
        </div>
        <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: "0 1 440px" }} aria-label="Subscribe to the newsletter" noValidate>
          <label htmlFor={emailId} className="sr-only">
            Email address
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@company.com"
            className="input-dark"
            style={{ flex: "1 1 220px" }}
            aria-invalid={state?.ok === false ? true : undefined}
            aria-describedby={state ? noteId : undefined}
            disabled={pending || done}
          />
          <input type="hidden" name="source" value={source} />
          <div className="honeypot" aria-hidden="true">
            <label>
              Company <input name="company" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <button type="submit" className="pill light" style={{ minHeight: 48, padding: "0 24px" }} disabled={pending || done}>
            {pending ? "Subscribing…" : done ? "Subscribed" : "Subscribe"}
          </button>
          <p id={noteId} role="status" aria-live="polite" className="form-note" data-tone={state ? (state.ok ? "success" : "error") : undefined} style={{ flexBasis: "100%", minHeight: 21 }}>
            {state ? (state.ok ? state.message : state.error) : ""}
          </p>
        </form>
      </div>
    </section>
  );
}
