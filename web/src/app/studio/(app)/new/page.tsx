import { Editor } from "@/components/studio/Editor";
import { admin } from "@/lib/api";
import { site } from "@/lib/site";
import { tagSuggestions } from "@/lib/tags";
import { blankInput, KINDS, type Kind } from "@/lib/types";

export default async function NewContentPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const k: Kind = KINDS.includes(kind as Kind) ? (kind as Kind) : "article";
  const items = await admin.list().catch(() => []); // suggestions are optional; never block writing
  return <Editor initial={blankInput(k)} siteUrl={site.url} tagSuggestions={tagSuggestions(items)} />;
}
