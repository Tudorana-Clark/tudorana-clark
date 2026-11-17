import type { Metadata } from "next";

import { Logo } from "@/components/Logo";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in to the studio", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
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
        <LoginForm next={next ?? "/studio"} />
      </div>
    </main>
  );
}
