/**
 * Public site identity. NEXT_PUBLIC_* values are inlined at build time and safe to expose.
 */
export const site = {
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  name: "Tudorana Clark",
  author: "Daniel Tudorana-Clark",
  jobTitle: "Director of AI",
  employer: "Hello AI Collective",
  description: "Insights on AI, technology, business and the economy. Personal website of Daniel Tudorana-Clark.",
  locale: "en_GB",
  language: "en-GB",
  social: {
    linkedin: "https://www.linkedin.com/in/tudoranaclark/",
    x: "https://x.com/tudoranaclark",
    xHandle: "@tudoranaclark",
  },
  topics: ["Artificial intelligence", "Technology", "Business", "Economics"],
  /** Brand photography, uploaded once via the studio and referenced by URL. */
  images: {
    portrait: process.env.NEXT_PUBLIC_PORTRAIT_URL || null,
    stage: process.env.NEXT_PUBLIC_STAGE_PHOTO_URL || null,
  },
  partners: ["Microsoft", "Lenovo", "Sage", "Adobe"],
} as const;

export function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}
