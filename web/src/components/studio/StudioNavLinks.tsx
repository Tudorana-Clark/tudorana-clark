"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string; match: (p: string) => boolean }[] = [
  // Content owns /studio, /studio/new and /studio/<id> (the content editor).
  { href: "/studio", label: "Content", match: (p) => p === "/studio" || p === "/studio/new" || /^\/studio\/[a-f0-9]{32}$/.test(p) },
  { href: "/studio/write", label: "Write", match: (p) => p.startsWith("/studio/write") },
  { href: "/studio/posts", label: "Posts", match: (p) => p.startsWith("/studio/posts") },
  { href: "/studio/results", label: "Results", match: (p) => p.startsWith("/studio/results") },
  { href: "/studio/sources", label: "Sources", match: (p) => p.startsWith("/studio/sources") },
  { href: "/studio/voice", label: "Voice", match: (p) => p.startsWith("/studio/voice") },
  { href: "/studio/inbox", label: "Inbox", match: (p) => p.startsWith("/studio/inbox") },
];

/** Studio section links, marking the current section for sighted users and screen readers alike. */
export function StudioNavLinks() {
  const path = usePathname();
  return (
    <div className="links">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(path) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <a href="/" target="_blank" rel="noopener">
        View site
      </a>
    </div>
  );
}
