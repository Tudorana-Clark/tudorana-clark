import Link from "next/link";
import { notFound } from "next/navigation";

import { PostEditor } from "@/components/studio/PostEditor";
import { ApiError, studio } from "@/lib/api";
import type { Post } from "@/lib/types";

async function load(id: string): Promise<{ post: Post } | { error: string }> {
  try {
    return { post: await studio.post(id) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return { error: err instanceof ApiError ? err.message : "Please try again." };
  }
}

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(id);
  if ("post" in result) return <PostEditor key={result.post.id} initial={result.post} />;
  return (
    <div role="alert" style={{ background: "var(--white)", borderRadius: 24, padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 className="display" style={{ fontSize: 28 }}>
        This post couldn’t load
      </h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{result.error}</p>
      <Link className="pill sm" href={`/studio/posts/${id}`} style={{ alignSelf: "flex-start" }}>
        Try again
      </Link>
    </div>
  );
}
