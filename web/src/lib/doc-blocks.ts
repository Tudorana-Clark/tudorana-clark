/**
 * Structured blocks inside a Markdown body.
 *
 * Authors write ordinary fenced code blocks whose language is a block name, e.g.
 *
 *   ```stats
 *   512/512 | task descriptors matched the independent oracle
 *   ```
 *
 * Lines starting with "@" set options (`@title …`); every other non-blank line is a row
 * whose fields are separated by " | ". Because the fences are plain Markdown, the .md twin,
 * llms-full.txt and RSS stay readable without any of this code.
 *
 * A block that fails to parse is kept as an ordinary code block (and logged), so a typo in the
 * studio can never take a page down.
 */

export const BLOCK_NAMES = ["stats", "bars", "callout", "cards", "steps", "glossary", "sources"] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];

export interface Stat {
  value: string;
  label: string;
}
export interface Bar {
  label: string;
  value: number;
  note: string;
}
export interface Card {
  title: string;
  tag: string;
  body: string;
}
export interface Step {
  title: string;
  body: string;
}
export interface Term {
  term: string;
  definition: string;
}
export interface Source {
  authors: string;
  year: string;
  title: string;
  venue: string;
  url: string;
  note: string;
}

export type Block =
  | { type: "stats"; title: string; items: Stat[] }
  | { type: "bars"; title: string; caption: string; unit: string; max: number; items: Bar[] }
  | { type: "callout"; title: string; tone: "note" | "finding"; markdown: string }
  | { type: "cards"; title: string; items: Card[] }
  | { type: "steps"; title: string; items: Step[] }
  | { type: "glossary"; title: string; items: Term[] }
  | { type: "sources"; title: string; items: Source[] };

export type Segment = { type: "markdown"; markdown: string } | { type: "block"; block: Block };

class BlockError extends Error {}

const FENCE = new RegExp(String.raw`^\`\`\`(${BLOCK_NAMES.join("|")})[ \t]*\r?\n([\s\S]*?)\r?\n\`\`\`[ \t]*$`, "gm");

interface Parsed {
  options: Map<string, string>;
  rows: string[][];
  text: string[];
}

function lex(source: string): Parsed {
  const options = new Map<string, string>();
  const rows: string[][] = [];
  const text: string[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const option = /^@([a-z]+)\s+(.+)$/.exec(line);
    if (option) {
      options.set(option[1], option[2].trim());
      continue;
    }
    text.push(raw);
    if (line) rows.push(line.split(/\s+\|\s+/).map((f) => f.trim()));
  }
  return { options, rows, text };
}

function need(row: string[], min: number, name: string): void {
  if (row.length < min || row.slice(0, min).some((f) => !f)) {
    throw new BlockError(`${name}: each row needs at least ${min} fields separated by " | " (got "${row.join(" | ")}")`);
  }
}

function nonEmpty<T>(items: T[], name: string): T[] {
  if (!items.length) throw new BlockError(`${name}: add at least one row`);
  return items;
}

function parseNumber(value: string, name: string): number {
  const n = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(n) || n < 0) throw new BlockError(`${name}: "${value}" isn't a number of zero or more`);
  return n;
}

/** "Bansal et al. (2021)" → authors + year. */
function splitAuthors(field: string): { authors: string; year: string } {
  const m = /^(.*?)\s*\((\d{4}[a-z]?)\)\s*$/.exec(field);
  return m ? { authors: m[1], year: m[2] } : { authors: field, year: "" };
}

function safeUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

export function parseBlock(name: BlockName, source: string): Block {
  const { options, rows, text } = lex(source);
  const title = options.get("title") ?? "";
  switch (name) {
    case "stats":
      return { type: "stats", title, items: nonEmpty(rows, name).map((r) => (need(r, 2, name), { value: r[0], label: r[1] })) };
    case "bars": {
      const items = nonEmpty(rows, name).map((r) => (need(r, 2, name), { label: r[0], value: parseNumber(r[1], name), note: r[2] ?? "" }));
      const largest = Math.max(...items.map((i) => i.value));
      const max = options.has("max") ? parseNumber(options.get("max") ?? "", name) : largest;
      if (!title) throw new BlockError("bars: add an @title line so the chart has a caption");
      if (max <= 0 || largest > max) throw new BlockError("bars: @max must be positive and at least the largest value");
      return { type: "bars", title, caption: options.get("caption") ?? "", unit: options.get("unit") ?? "", max, items };
    }
    case "callout": {
      const markdown = text.join("\n").trim();
      if (!markdown) throw new BlockError("callout: add some text");
      return { type: "callout", title, tone: options.get("tone") === "finding" ? "finding" : "note", markdown };
    }
    case "cards":
      return {
        type: "cards",
        title,
        items: nonEmpty(rows, name).map((r) => {
          need(r, 2, name);
          return r.length >= 3 ? { title: r[0], tag: r[1], body: r.slice(2).join(" | ") } : { title: r[0], tag: "", body: r[1] };
        }),
      };
    case "steps":
      return { type: "steps", title, items: nonEmpty(rows, name).map((r) => (need(r, 2, name), { title: r[0], body: r.slice(1).join(" | ") })) };
    case "glossary":
      return { type: "glossary", title, items: nonEmpty(rows, name).map((r) => (need(r, 2, name), { term: r[0], definition: r.slice(1).join(" | ") })) };
    case "sources":
      return {
        type: "sources",
        title,
        items: nonEmpty(rows, name).map((r) => {
          need(r, 2, name);
          return { ...splitAuthors(r[0]), title: r[1], venue: r[2] ?? "", url: safeUrl(r[3]), note: r[4] ?? "" };
        }),
      };
  }
}

/** Split a body into Markdown and block segments, in order. */
export function parseDocument(body: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  const pushMarkdown = (md: string) => {
    if (md.trim()) segments.push({ type: "markdown", markdown: md });
  };
  for (const match of body.matchAll(FENCE)) {
    const [whole, name, source] = match;
    const start = match.index;
    try {
      const block = parseBlock(name as BlockName, source);
      pushMarkdown(body.slice(last, start));
      segments.push({ type: "block", block });
      last = start + whole.length;
    } catch (err) {
      if (!(err instanceof BlockError)) throw err;
      // Leave it in the Markdown so it renders as a plain code block.
      console.warn(JSON.stringify({ level: "warn", event: "doc_block_invalid", block: name, reason: err.message }));
    }
  }
  pushMarkdown(body.slice(last));
  return segments;
}

export function blocksOf<T extends Block["type"]>(segments: Segment[], type: T): Extract<Block, { type: T }>[] {
  return segments.flatMap((s) => (s.type === "block" && s.block.type === type ? [s.block as Extract<Block, { type: T }>] : []));
}

type Json = Record<string, unknown>;

/** schema.org facts from a body: the works it cites and the terms it defines. */
export function docGraphExtras(segments: Segment[], pageUrl: string): { citation: Json[]; nodes: Json[] } {
  const citation = blocksOf(segments, "sources").flatMap((b) =>
    b.items.map((s) => ({
      "@type": "CreativeWork",
      name: s.title,
      author: s.authors,
      datePublished: /^\d{4}/.exec(s.year)?.[0],
      isPartOf: s.venue || undefined,
      url: s.url || undefined,
    })),
  );
  const terms = blocksOf(segments, "glossary").flatMap((b) => b.items);
  const nodes: Json[] = terms.length
    ? [
        {
          "@type": "DefinedTermSet",
          "@id": `${pageUrl}#terms`,
          name: "Key terms",
          hasDefinedTerm: terms.map((t) => ({ "@type": "DefinedTerm", name: t.term, description: t.definition, inDefinedTermSet: `${pageUrl}#terms` })),
        },
      ]
    : [];
  return { citation, nodes };
}
