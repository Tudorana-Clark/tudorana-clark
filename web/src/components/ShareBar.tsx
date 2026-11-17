"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { SocialCopy } from "@/lib/types";

interface Props {
  url: string;
  title: string;
  social: SocialCopy;
}

/** Adds UTM tags so each network's traffic is attributable in analytics. */
function tagged(url: string, source: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", "share");
  return u.toString();
}

const noopSubscribe = () => () => {};

export function ShareBar({ url, title, social }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const canNativeShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const enc = encodeURIComponent;
  const x = social.x || title;
  const short = social.bluesky || title;
  const targets = [
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(tagged(url, "linkedin"))}` },
    { label: "X", href: `https://x.com/intent/post?text=${enc(x)}&url=${enc(tagged(url, "x"))}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(tagged(url, "facebook"))}` },
    { label: "Threads", href: `https://www.threads.net/intent/post?text=${enc(`${social.threads || title} ${tagged(url, "threads")}`)}` },
    { label: "Bluesky", href: `https://bsky.app/intent/compose?text=${enc(`${short} ${tagged(url, "bluesky")}`)}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${enc(`${title} ${tagged(url, "whatsapp")}`)}` },
    { label: "Email", href: `mailto:?subject=${enc(title)}&body=${enc(`${social.facebook || title}\n\n${tagged(url, "email")}`)}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(tagged(url, "copy"));
      setToast("Link copied");
    } catch {
      setToast("Couldn’t copy — select the address bar instead");
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text: social.x || title, url: tagged(url, "native") });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // user closed the sheet
      setToast("Sharing isn’t available here");
    }
  }

  return (
    <div className="no-print" role="group" aria-label="Share this page" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {canNativeShare && (
        <button type="button" className="pill sm" onClick={nativeShare}>
          Share
        </button>
      )}
      {targets.map((t) => (
        <a key={t.label} className="pill ghost sm" href={t.href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${t.label} (opens in a new tab)`}>
          {t.label}
        </a>
      ))}
      <button type="button" className="pill ghost sm" onClick={copy}>
        Copy link
      </button>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
