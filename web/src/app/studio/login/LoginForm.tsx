"use client";

import { useActionState } from "react";

import { loginAction } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const error = state?.ok === false ? state.error : null;
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="next" value={next} />
      <label className="field">
        Password
        <input className="input" type="password" name="password" autoComplete="current-password" required autoFocus aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined} disabled={pending} />
      </label>
      <button className="pill" type="submit" disabled={pending} style={{ minHeight: 48 }}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p id="login-error" role="alert" className="form-note" data-tone="error" style={{ minHeight: 21 }}>
        {error ?? ""}
      </p>
    </form>
  );
}
