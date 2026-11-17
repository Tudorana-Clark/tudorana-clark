import { connection } from "next/server";

import { SourcesLibrary } from "@/components/studio/SourcesLibrary";
import { ApiError, studio } from "@/lib/api";
import type { LibrarySource } from "@/lib/types";

export default async function SourcesPage() {
  await connection();
  let items: LibrarySource[] = [];
  let error: string | null = null;
  try {
    items = await studio.sources();
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Your sources couldn’t load. Please try again.";
  }
  return <SourcesLibrary initial={items} loadError={error} />;
}
