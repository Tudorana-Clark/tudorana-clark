"use client";

import { useEffect, useRef } from "react";

import type { Heading } from "@/lib/markdown";

/**
 * "On this page" list that highlights the section in view.
 * Chrome tracks it natively (scroll-target-group + :target-current); other browsers get a light scroll
 * fallback. Either way aria-current mirrors the highlight for screen readers. Without JS it's a plain list of links.
 */
export function Contents({
  headings,
  variant,
}: {
  headings: Heading[];
  variant: "aside" | "inline";
}) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const links = Array.from(
      list.querySelectorAll<HTMLAnchorElement>("a[href^='#']"),
    );
    const mark = (current: HTMLAnchorElement | null) => {
      for (const link of links) {
        link.classList.toggle("is-current", link === current);
        if (link === current) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
    };

    // Chromium knows which link is current (:target-current); elsewhere, the last heading above 30% of the viewport wins.
    const native = CSS.supports("scroll-target-group: auto");
    const targets = links.map((l) => document.getElementById(decodeURIComponent(l.hash.slice(1))));
    const pick = (): HTMLAnchorElement | null => {
      if (native) return list.querySelector<HTMLAnchorElement>("a:target-current");
      const line = window.innerHeight * 0.3;
      let current: HTMLAnchorElement | null = null;
      targets.forEach((t, i) => {
        if (t && t.getBoundingClientRect().top <= line) current = links[i];
      });
      return current;
    };

    let frame = 0;
    let settle = 0;
    const update = () => {
      frame = 0;
      mark(pick());
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
      // :target-current can settle a frame after scrolling stops, so check once more when it does.
      window.clearTimeout(settle);
      settle = window.setTimeout(update, 150);
    };
    settle = window.setTimeout(update, 150);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, []);

  const list = (
    <>
      {/* Native scrollspy in Chromium; kept out of globals.css because the CSS toolchain can't parse :target-current yet.
          :is() is forgiving, so other browsers ignore it and use the .is-current fallback. */}
      <style href="toc-target-current" precedence="default">
        {
          ".toc-list a:is(:target-current){color:var(--ink);font-weight:600;border-left-color:var(--brass)}"
        }
      </style>
      <ol ref={listRef} className="toc-list">
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`}>{h.text}</a>
          </li>
        ))}
      </ol>
    </>
  );

  if (variant === "inline") {
    return (
      <details className="toc-inline">
        <summary>On this page</summary>
        <nav aria-label="On this page">{list}</nav>
      </details>
    );
  }
  return (
    <nav className="toc-aside" aria-labelledby="toc-title">
      <p id="toc-title" className="toc-title">
        On this page
      </p>
      {list}
    </nav>
  );
}
