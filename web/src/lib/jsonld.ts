import { pathFor } from "./content";
import { absoluteUrl, site } from "./site";
import type { Content } from "./types";

/**
 * schema.org graph builders. Structured data is how search engines and AI answer engines
 * attribute a claim to an author, so every page links back to the same Person (@id).
 */

type Json = Record<string, unknown>;

export const PERSON_ID = `${site.url}/#person`;
export const WEBSITE_ID = `${site.url}/#website`;

export function personNode(): Json {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: site.author,
    url: absoluteUrl("/about"),
    jobTitle: site.jobTitle,
    worksFor: { "@type": "Organization", name: site.employer },
    alumniOf: { "@type": "CollegeOrUniversity", name: "University of Hertfordshire" },
    knowsAbout: [...site.topics, "AI adoption", "Human oversight of AI"],
    sameAs: [site.social.linkedin, site.social.x],
  };
}

export function websiteNode(): Json {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: site.url,
    name: site.name,
    description: site.description,
    inLanguage: site.language,
    publisher: { "@id": PERSON_ID },
    author: { "@id": PERSON_ID },
  };
}

export function breadcrumbs(trail: { name: string; path: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: absoluteUrl(t.path) })),
  };
}

export function contentGraph(c: Content, section: { name: string; path: string }): Json {
  const url = absoluteUrl(pathFor(c));
  const image = c.feature_image?.url ?? absoluteUrl(`${pathFor(c)}/opengraph-image`);
  const common: Json = {
    "@id": `${url}#content`,
    headline: c.seo.meta_title || c.title,
    name: c.title,
    description: c.seo.meta_description || c.excerpt,
    abstract: c.seo.tldr || undefined,
    url,
    mainEntityOfPage: url,
    image,
    inLanguage: site.language,
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
    datePublished: c.published_at ?? undefined,
    dateModified: c.updated_at,
    keywords: c.seo.keywords.length ? c.seo.keywords.join(", ") : c.tags.join(", "),
    articleSection: c.category || undefined,
    about: c.seo.entities.map((e) => ({ "@type": "Thing", name: e })),
    isPartOf: { "@id": WEBSITE_ID },
    wordCount: c.word_count || undefined,
    timeRequired: c.reading_minutes ? `PT${c.reading_minutes}M` : undefined,
  };

  const nodes: Json[] = [breadcrumbs([{ name: "Home", path: "/" }, section, { name: c.title, path: pathFor(c) }])];

  switch (c.kind) {
    case "research":
      nodes.push({ ...common, "@type": "ScholarlyArticle", citation: c.research?.citation || undefined, sourceOrganization: c.research?.institution ? { "@type": "CollegeOrUniversity", name: c.research.institution } : undefined, encoding: c.research?.pdf_url ? { "@type": "MediaObject", encodingFormat: "application/pdf", contentUrl: c.research.pdf_url } : undefined });
      break;
    case "talk":
      nodes.push({ ...common, "@type": "Article" });
      if (c.event) {
        nodes.push({
          "@type": "Event",
          name: c.event.name,
          startDate: c.event.date,
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          location: c.event.location ? { "@type": "Place", name: c.event.location, address: c.event.location } : undefined,
          url: c.event.url ?? url,
          performer: { "@id": PERSON_ID },
          organizer: { "@type": "Organization", name: c.event.name, url: c.event.url ?? url },
          image,
          description: c.excerpt || c.title,
        });
      }
      break;
    case "video":
      nodes.push({
        ...common,
        "@type": "VideoObject",
        uploadDate: c.published_at ?? c.updated_at,
        thumbnailUrl: c.video?.thumbnail?.url ?? image,
        embedUrl: c.video?.embed_url,
        duration: c.video?.duration_iso ?? undefined,
      });
      break;
    default:
      nodes.push({ ...common, "@type": c.kind === "note" ? "SocialMediaPosting" : "BlogPosting" });
  }

  if (c.seo.faq.length) {
    nodes.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: c.seo.faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
    });
  }
  return { "@context": "https://schema.org", "@graph": [...nodes, personNode()] };
}

/** Serialise for a <script type="application/ld+json">, escaping `<` so content can't close the tag. */
export function serializeJsonLd(data: Json): string {
  return JSON.stringify(data, (_k, v: unknown) => (v === "" ? undefined : v)).replace(/</g, "\\u003c");
}
