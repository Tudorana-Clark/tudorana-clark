import "server-only";

import { getPublished, listPublished } from "./api";
import { KIND_LABEL, pathFor } from "./content";
import { renderMarkdown } from "./markdown";
import { absoluteUrl, site } from "./site";
import type { Content, ContentSummary } from "./types";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function rssFeed(): Promise<string> {
  const items = await listPublished(undefined, 50);
  const full = (await Promise.all(items.map((i) => getPublished(i.slug).catch(() => null)))).filter((c): c is Content => c !== null);
  const entries = full
    .map((c) => {
      const url = absoluteUrl(pathFor(c));
      return `<item>
  <title>${xml(c.title)}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  <pubDate>${new Date(c.published_at ?? c.updated_at).toUTCString()}</pubDate>
  <dc:creator>${xml(site.author)}</dc:creator>
  ${c.category ? `<category>${xml(c.category)}</category>` : ""}
  ${c.tags.map((t) => `<category>${xml(t)}</category>`).join("")}
  <description>${xml(c.seo.meta_description || c.excerpt)}</description>
  <content:encoded><![CDATA[${renderMarkdown(c.body).html.replaceAll("]]>", "]]]]><![CDATA[>")}]]></content:encoded>
</item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>${xml(site.name)}</title>
  <link>${site.url}</link>
  <description>${xml(site.description)}</description>
  <language>${site.language}</language>
  <atom:link href="${absoluteUrl("/feed.xml")}" rel="self" type="application/rss+xml" />
  ${full[0] ? `<lastBuildDate>${new Date(full[0].updated_at).toUTCString()}</lastBuildDate>` : ""}
${entries}
</channel>
</rss>`;
}

function line(c: ContentSummary): string {
  return `- [${c.title}](${absoluteUrl(`${pathFor(c)}.md`)}): ${c.excerpt || KIND_LABEL[c.kind]}`;
}

/** llms.txt (llmstxt.org): a curated, Markdown map of the site for language models. */
export async function llmsTxt(): Promise<string> {
  const items = await listPublished(undefined, 200);
  const by = (kinds: string[]) => items.filter((i) => kinds.includes(i.kind));
  const section = (title: string, list: ContentSummary[]) => (list.length ? `\n## ${title}\n\n${list.map(line).join("\n")}\n` : "");
  return `# ${site.name}

> ${site.description} ${site.author} is ${site.jobTitle} at ${site.employer}, formerly Senior Director of Application Development and AI at Monster Energy across EMEA and Oceania, and holds an MSc in Computer Science with Software Engineering from the University of Hertfordshire.

Core arguments: growth comes from adopting technology, not inventing it; when output becomes cheap, ownership becomes the advantage; AI is creating a generational skills gap rather than replacing skills.

Every page is also available as Markdown by appending \`.md\` to its URL. Full text of everything: ${absoluteUrl("/llms-full.txt")}
${section("Articles", by(["article"]))}${section("Research", by(["research"]))}${section("Talks and video", by(["talk", "video"]))}${section("Notes", by(["note"]))}
## About

- [About ${site.author}](${absoluteUrl("/about")}): biography, career and contact
- [LinkedIn](${site.social.linkedin})
- [RSS feed](${absoluteUrl("/feed.xml")})
`;
}

export function toMarkdown(c: Content): string {
  const url = absoluteUrl(pathFor(c));
  const fm = [
    "---",
    `title: ${JSON.stringify(c.title)}`,
    `author: ${JSON.stringify(site.author)}`,
    `url: ${url}`,
    c.published_at ? `published: ${c.published_at}` : null,
    `updated: ${c.updated_at}`,
    c.category ? `category: ${JSON.stringify(c.category)}` : null,
    c.tags.length ? `tags: [${c.tags.map((t) => JSON.stringify(t)).join(", ")}]` : null,
    c.seo.meta_description ? `description: ${JSON.stringify(c.seo.meta_description)}` : null,
    "---",
  ].filter(Boolean);
  const summary = c.seo.tldr ? `\n> **In short:** ${c.seo.tldr}\n` : "";
  const takeaways = c.seo.key_takeaways.length ? `\n**Key takeaways**\n\n${c.seo.key_takeaways.map((k) => `- ${k}`).join("\n")}\n` : "";
  const faq = c.seo.faq.length ? `\n## Questions people ask\n\n${c.seo.faq.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n")}\n` : "";
  const cite = c.research?.citation ? `\n## Cite this work\n\n${c.research.citation}\n` : "";
  return `${fm.join("\n")}\n\n# ${c.title}\n${c.subtitle ? `\n_${c.subtitle}_\n` : ""}${summary}${takeaways}\n${c.body.trim()}\n${faq}${cite}\n---\nBy ${site.author} · ${url}\n`;
}

export async function llmsFull(): Promise<string> {
  const items = await listPublished(undefined, 200);
  const full = (await Promise.all(items.map((i) => getPublished(i.slug).catch(() => null)))).filter((c): c is Content => c !== null);
  return [await llmsTxt(), ...full.map(toMarkdown)].join("\n\n");
}
