import "server-only";

import { Marked, type Tokens } from "marked";
import sanitizeHtml from "sanitize-html";

export interface Heading {
  id: string;
  text: string;
  depth: number;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

const ALLOWED_IFRAME_HOSTS = ["www.youtube-nocookie.com", "www.youtube.com", "player.vimeo.com", "stream.mux.com"];

/**
 * Markdown → safe HTML. Headings get stable ids (for deep links and AI citations),
 * external links open safely, images lazy-load, and everything is sanitised.
 */
export function renderMarkdown(md: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Heading) {
        const text = this.parser.parseInline(token.tokens);
        const base = slug(text) || "section";
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n ? `${base}-${n}` : base;
        if (token.depth <= 3) headings.push({ id, text: text.replace(/<[^>]+>/g, ""), depth: token.depth });
        const depth = Math.max(2, token.depth); // the page owns the single <h1>
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
    },
  });

  const raw = marked.parse(md, { async: false });
  const html = sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h2", "figure", "figcaption", "iframe", "del", "ins", "sup", "sub"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["id"],
      a: ["href", "title", "rel", "target"],
      img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      iframe: ["src", "title", "allow", "allowfullscreen", "loading"],
      code: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedIframeHostnames: ALLOWED_IFRAME_HOSTS,
    transformTags: {
      a: (tagName, attribs) => {
        const external = /^https?:\/\//.test(attribs.href ?? "") && !attribs.href?.startsWith(process.env.NEXT_PUBLIC_SITE_URL ?? "\u0000");
        return { tagName, attribs: external ? { ...attribs, rel: "noopener noreferrer", target: "_blank" } : attribs };
      },
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy", decoding: "async" } }),
      iframe: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy", allowfullscreen: "" } }),
    },
  });
  return { html, headings };
}
