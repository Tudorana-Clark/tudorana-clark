import Link from "next/link";
import { connection } from "next/server";

import { IdeaBank } from "@/components/studio/IdeaBank";
import { ApiError, studio } from "@/lib/api";
import { formatShort } from "@/lib/content";
import type { Idea, Post, PostStatus } from "@/lib/types";

const STATUS: Record<PostStatus, { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "var(--card)", fg: "var(--muted)" },
  ready: { label: "Ready", bg: "#F4ECDD", fg: "var(--brass)" },
  posted: { label: "Posted", bg: "#E6F2EA", fg: "var(--success)" },
};

function message(err: unknown, what: string): string {
  return err instanceof ApiError ? err.message : `${what} couldn’t load. Please try again.`;
}

export default async function PostsPage() {
  await connection();
  const [posts, ideas, voice] = await Promise.allSettled([studio.posts(), studio.ideas(), studio.voice()]);
  const postList: Post[] = posts.status === "fulfilled" ? posts.value : [];
  const ideaList: Idea[] = ideas.status === "fulfilled" ? ideas.value : [];
  const hasVoice = voice.status === "fulfilled" && Boolean(voice.value.guide);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="display" style={{ fontSize: 40 }}>
            Posts
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 15 }}>Short insights for LinkedIn and X, written in your voice, with a quote card or illustration.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="pill ghost sm" href="/studio/voice">
            {hasVoice ? "Voice guide" : "Set up your voice"}
          </Link>
          <Link className="pill sm" href="/studio/posts/new">
            New post
          </Link>
        </div>
      </div>

      {!hasVoice && voice.status === "fulfilled" && (
        <p role="status" className="form-note" style={{ background: "var(--white)", borderRadius: 14, padding: "12px 16px" }}>
          Drafts use a generic voice until you set yours up. <Link href="/studio/voice">Learn it from your writing</Link> — it takes about 20 seconds.
        </p>
      )}

      <div className="studio-split">
        <section aria-labelledby="library-h" style={{ background: "var(--white)", borderRadius: 24, overflow: "hidden" }}>
          <h2 id="library-h" style={{ margin: 0, padding: "20px 24px 12px", fontSize: 18, fontWeight: 600 }}>
            Library
          </h2>
          {posts.status === "rejected" ? (
            <div role="alert" style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
              <p style={{ margin: 0, color: "var(--muted)" }}>{message(posts.reason, "Posts")}</p>
              <Link className="pill sm" href="/studio/posts">
                Try again
              </Link>
            </div>
          ) : postList.length === 0 ? (
            <div style={{ padding: "0 24px 32px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
              <p style={{ margin: 0, color: "var(--muted)" }}>No posts yet. Start from an idea in the bank, or write one from scratch.</p>
              <Link className="pill sm" href="/studio/posts/new">
                New post
              </Link>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {postList.map((p) => {
                const s = STATUS[p.status];
                return (
                  <li key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <Link href={`/studio/posts/${p.id}`} className="post-row">
                      <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.hook || p.seed}</span>
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>
                          {[
                            p.score ? `Score ${p.score.total}${p.score.stale ? " (edited since)" : ""}` : "",
                            p.planned_for && p.status !== "posted" ? `Planned ${new Date(p.planned_for).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "",
                            p.visual === "quote" ? "Quote card" : p.visual === "image" ? "Illustration" : "",
                            p.source ? `From ${p.source.title}` : "",
                            `Updated ${formatShort(p.updated_at)}`,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{s.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <IdeaBank initial={ideaList} loadError={ideas.status === "rejected" ? message(ideas.reason, "Ideas") : null} />
      </div>
    </div>
  );
}
