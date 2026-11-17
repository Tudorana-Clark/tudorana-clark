import { OG_SIZE, renderCard } from "@/lib/og";
import { site } from "@/lib/site";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = `${site.name} — Insights on AI, technology, business and the economy`;

export default async function Image() {
  return renderCard({ kicker: `${site.jobTitle}, ${site.employer}`, title: "Insights on AI, technology, business and the economy.", meta: site.author });
}
