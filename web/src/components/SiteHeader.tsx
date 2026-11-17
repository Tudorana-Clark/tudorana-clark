"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "./Logo";

const LINKS = [
  { href: "/writing", label: "Writing" },
  { href: "/research", label: "Research" },
  { href: "/speaking", label: "Speaking" },
  { href: "/speaking#video", label: "Video" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const isActive = (href: string) => !href.includes("#") && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className="wrap no-print">
      <nav className="nav" aria-label="Main">
        <Link href="/" aria-label="Tudorana Clark home" className="nav-home">
          <Logo />
        </Link>
        <div className="links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </div>
        <Link className="pill sm" href="#newsletter">
          Subscribe
        </Link>
      </nav>
    </header>
  );
}
