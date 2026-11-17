import type { Metadata } from "next";

import { Logo } from "@/components/Logo";
import { passwordLoginEnabled } from "@/lib/env";
import { ssoConfigured } from "@/lib/oidc";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in to the studio", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  denied: "That Microsoft account doesn’t have access to the studio. Sign in as daniel@tudoranaclark.com.",
  expired: "The sign-in took too long or was opened in another tab. Please try again.",
  invalid: "Microsoft couldn’t confirm the sign-in. Please try again.",
  unavailable: "Microsoft sign-in isn’t reachable right now. Try again in a moment.",
};

function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <path fill="#F25022" d="M1 1h9v9H1z" />
      <path fill="#7FBA00" d="M11 1h9v9h-9z" />
      <path fill="#00A4EF" d="M1 11h9v9H1z" />
      <path fill="#FFB900" d="M11 11h9v9h-9z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const target = next?.startsWith("/studio") ? next : "/studio";
  const message = error ? (ERRORS[error] ?? ERRORS.invalid) : null;
  const sso = ssoConfigured();

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--card)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "var(--white)", borderRadius: 28, padding: 40, display: "flex", flexDirection: "column", gap: 24 }}>
        <Logo />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="display" style={{ fontSize: 32 }}>
            Studio
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 15 }}>Sign in to write, publish and share.</p>
        </div>
        {message && (
          <p role="alert" className="form-note" data-tone="error">
            {message}
          </p>
        )}
        {sso && (
          <a className="pill" href={`/studio/auth/login?next=${encodeURIComponent(target)}`} style={{ minHeight: 48, gap: 12 }}>
            <MicrosoftMark />
            Continue with Microsoft
          </a>
        )}
        {passwordLoginEnabled() && <LoginForm next={target} />}
        {!sso && !passwordLoginEnabled() && <p className="form-note">Sign-in isn’t configured on this server.</p>}
      </div>
    </main>
  );
}
