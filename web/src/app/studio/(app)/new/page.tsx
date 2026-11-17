import { Editor } from "@/components/studio/Editor";
import { site } from "@/lib/site";
import { blankInput, KINDS, type Kind } from "@/lib/types";

export default async function NewContentPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const k: Kind = KINDS.includes(kind as Kind) ? (kind as Kind) : "article";
  return <Editor initial={blankInput(k)} siteUrl={site.url} />;
}
