import "server-only";

import { Suspense, type ReactNode } from "react";

import type { Bar, Block, Segment } from "@/lib/doc-blocks";
import { renderMarkdown, type Heading } from "@/lib/markdown";

import { Instrument, InstrumentSkeleton } from "./Instrument";

type Shared = { used: Map<string, number>; headings: Heading[] };

/** Render parsed segments in order. Markdown fragments share heading ids so the contents list stays correct. */
export function renderDoc(segments: Segment[]): { nodes: ReactNode[]; headings: Heading[] } {
  const shared: Shared = { used: new Map(), headings: [] };
  const nodes = segments.map((s, i) =>
    s.type === "markdown" ? (
      <div key={i} className="prose plain doc-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.markdown, shared).html }} />
    ) : (
      <DocBlock key={i} block={s.block} shared={shared} />
    ),
  );
  return { nodes, headings: shared.headings };
}

function BlockTitle({ children }: { children: string }) {
  return children ? <h3 className="doc-block-title">{children}</h3> : null;
}

function DocBlock({ block, shared }: { block: Block; shared: Shared }) {
  switch (block.type) {
    case "stats":
      return (
        <section className="doc-block" aria-label={block.title || "Key figures"}>
          <BlockTitle>{block.title}</BlockTitle>
          <dl className="doc-stats">
            {block.items.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
    case "bars":
      return <Bars title={block.title} caption={block.caption} unit={block.unit} max={block.max} items={block.items} />;
    case "callout":
      return (
        <aside className={`doc-callout ${block.tone}`} aria-label={block.title || "Note"}>
          {block.title && <p className="doc-callout-title">{block.title}</p>}
          <div className="prose plain" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.markdown, shared).html }} />
        </aside>
      );
    case "cards":
      return (
        <section className="doc-block" aria-label={block.title || undefined}>
          <BlockTitle>{block.title}</BlockTitle>
          <ul className="doc-cards">
            {block.items.map((c) => (
              <li key={c.title}>
                <div className="doc-card-head">
                  <strong>{c.title}</strong>
                  {c.tag && <span className="doc-tag">{c.tag}</span>}
                </div>
                <p>{c.body}</p>
              </li>
            ))}
          </ul>
        </section>
      );
    case "steps":
      return (
        <section className="doc-block" aria-label={block.title || undefined}>
          <BlockTitle>{block.title}</BlockTitle>
          <ol className="doc-steps">
            {block.items.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      );
    case "glossary":
      return (
        <section className="doc-block" aria-label={block.title || "Key terms"}>
          <BlockTitle>{block.title}</BlockTitle>
          <dl className="doc-glossary">
            {block.items.map((t) => (
              <div key={t.term} id={`term-${t.term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <dt>{t.term}</dt>
                <dd>{t.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
    case "instrument":
      return (
        <Suspense fallback={<InstrumentSkeleton title={block.title} />}>
          <Instrument title={block.title} intro={block.intro} />
        </Suspense>
      );
    case "sources":
      return (
        <section className="doc-block" aria-label={block.title || "Sources"}>
          <BlockTitle>{block.title}</BlockTitle>
          <ol className="doc-sources">
            {block.items.map((s) => (
              <li key={`${s.authors}${s.year}${s.title}`}>
                <p className="doc-source-cite">
                  {s.authors}
                  {s.year && ` (${s.year})`}.{" "}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <cite>{s.title}</cite>
                  )}
                  {s.venue && <span className="doc-source-venue">. {s.venue}</span>}
                </p>
                {s.note && <p className="doc-source-note">{s.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      );
  }
}

/** Horizontal bar chart as a real table: screen readers get rows and values; the bars are decoration. */
function Bars({ title, caption, unit, max, items }: { title: string; caption: string; unit: string; max: number; items: Bar[] }) {
  const fmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
  return (
    <figure className="doc-block doc-bars">
      <table>
        <caption>{title}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Item</th>
            <th scope="col">{unit || "Value"}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.label}>
              <th scope="row">
                {b.label}
                {b.note && <span className="doc-bar-note">{b.note}</span>}
              </th>
              <td>
                <span className="doc-bar-track" aria-hidden="true">
                  <span className="doc-bar-fill" style={{ inlineSize: `${Math.max(b.value > 0 ? 1.5 : 0, (b.value / max) * 100)}%` }} />
                </span>
                <span className="doc-bar-value">
                  {fmt.format(b.value)}
                  {unit && <span className="doc-bar-unit"> {unit}</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
