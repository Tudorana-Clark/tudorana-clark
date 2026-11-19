import "server-only";

import { unstable_rethrow } from "next/navigation";

import { env } from "./env";
import type { ArticleWork, ContactMessage, CopyScore, Experiment, ResultsSummary, ImportCandidate, LibrarySource, Content, ContentSummary, CoverBrief, CoverResult, Idea, Kind, Playbook, Post, PostWriteResult, SeoSuggestion, Subscriber, VoiceProfile } from "./types";

interface ContentList {
  items: ContentSummary[];
}

/** Tag attached to every cached content read; publishing calls updateTag(CONTENT_TAG). */
export const CONTENT_TAG = "content";
const REVALIDATE_SECONDS = 300;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Problem {
  detail?: string;
  title?: string;
}

async function request<T>(path: string, init: RequestInit & { next?: NextFetchRequestConfig; admin?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const { admin, headers, timeoutMs = env.API_TIMEOUT_MS, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (admin) finalHeaders.set("x-admin-key", env.ADMIN_API_KEY);
  if (rest.body && !(rest.body instanceof FormData)) finalHeaders.set("content-type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${env.API_URL}${path}`, { ...rest, headers: finalHeaders, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    unstable_rethrow(err); // let Next.js dynamic-rendering / redirect signals propagate
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    console.error(JSON.stringify({ msg: "api_unreachable", path, timedOut, error: String(err) }));
    throw new ApiError(timedOut ? "The server took too long to respond. Please try again." : "We couldn’t reach the server. Please try again.", 503);
  }

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const problem = (body ?? {}) as Problem;
    if (res.status >= 500) console.error(JSON.stringify({ msg: "api_error", path, status: res.status, detail: problem.detail }));
    throw new ApiError(problem.detail ?? "Something went wrong. Please try again.", res.status);
  }
  return body as T;
}

// ---------- Public reads (cached, tag-invalidated) ----------

const cached: RequestInit = { next: { revalidate: REVALIDATE_SECONDS, tags: [CONTENT_TAG] } };

export async function listPublished(kind?: Kind, limit = 50): Promise<ContentSummary[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (kind) q.set("kind", kind);
  const data = await request<ContentList>(`/v1/content?${q}`, cached);
  return data.items;
}

/** Returns null for a missing page so callers can render notFound(). */
export async function getPublished(slug: string): Promise<Content | null> {
  try {
    return await request<Content>(`/v1/content/${encodeURIComponent(slug)}`, cached);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Listing read that degrades to an empty list instead of failing the whole page.
 * Used for secondary sections (e.g. "Latest writing" on the home page).
 */
export async function listPublishedSafe(kind?: Kind, limit = 50): Promise<{ items: ContentSummary[]; failed: boolean }> {
  try {
    return { items: await listPublished(kind, limit), failed: false };
  } catch (err) {
    unstable_rethrow(err);
    return { items: [], failed: true };
  }
}

// ---------- Public writes ----------

export function subscribe(email: string, source: string, clientIp: string) {
  return request<{ ok: boolean; new: boolean }>("/v1/subscribe", {
    method: "POST",
    body: JSON.stringify({ email, source }),
    headers: { "x-client-ip": clientIp },
    cache: "no-store",
  });
}

export function sendContact(input: { name: string; email: string; topic: string; message: string }, clientIp: string) {
  return request<{ ok: boolean }>("/v1/contact", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "x-client-ip": clientIp },
    cache: "no-store",
  });
}

// ---------- Admin (never cached) ----------

export const admin = {
  list: () => request<ContentList>("/v1/admin/content", { admin: true, cache: "no-store" }).then((d) => d.items),
  get: (id: string) => request<Content>(`/v1/admin/content/${encodeURIComponent(id)}`, { admin: true, cache: "no-store" }),
  create: (input: unknown) => request<Content>("/v1/admin/content", { method: "POST", body: JSON.stringify(input), admin: true, cache: "no-store" }),
  update: (id: string, input: unknown) =>
    request<Content>(`/v1/admin/content/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input), admin: true, cache: "no-store" }),
  setStatus: (id: string, status: "publish" | "unpublish") =>
    request<Content>(`/v1/admin/content/${encodeURIComponent(id)}/${status}`, { method: "POST", admin: true, cache: "no-store" }),
  remove: (id: string) => request<void>(`/v1/admin/content/${encodeURIComponent(id)}`, { method: "DELETE", admin: true, cache: "no-store" }),
  seo: (input: unknown) => request<SeoSuggestion>("/v1/admin/ai/seo", { method: "POST", body: JSON.stringify(input), admin: true, cache: "no-store", timeoutMs: 60_000 }),
  // Up to 4 renders in parallel, each with retries on 429: allow well beyond a single render.
  covers: (input: unknown) => request<CoverResult>("/v1/admin/ai/covers", { method: "POST", body: JSON.stringify(input), admin: true, cache: "no-store", timeoutMs: 180_000 }),
  upload: (form: FormData) => request<{ url: string; content_type: string; bytes: number }>("/v1/admin/media", { method: "POST", body: form, admin: true, cache: "no-store", timeoutMs: 30_000 }),
  subscribers: () => request<Subscriber[]>("/v1/admin/subscribers", { admin: true, cache: "no-store" }),
  messages: () => request<ContactMessage[]>("/v1/admin/messages", { admin: true, cache: "no-store" }),
};

// ---------- Content studio (never cached) ----------

const S = "/v1/admin/studio";
const json = (method: string, body: unknown, timeoutMs?: number) => ({ method, body: JSON.stringify(body), admin: true, cache: "no-store" as const, timeoutMs });
const get = { admin: true, cache: "no-store" as const };

export const studio = {
  coverBriefs: (input: unknown) => request<{ briefs: CoverBrief[] }>(`${S}/cover-briefs`, json("POST", input, 60_000)),
  voice: () => request<VoiceProfile>(`${S}/voice`, get),
  saveVoice: (guide: string) => request<VoiceProfile>(`${S}/voice`, json("PUT", { guide })),
  learnVoice: () => request<{ guide: string; learned_from: number }>(`${S}/voice/learn`, { method: "POST", admin: true, cache: "no-store", timeoutMs: 120_000 }),
  ideas: () => request<Idea[]>(`${S}/ideas`, get),
  addIdea: (text: string) => request<Idea>(`${S}/ideas`, json("POST", { text })),
  mineIdeas: () => request<{ added: number; scanned: number; remaining: number }>(`${S}/ideas/mine`, { method: "POST", admin: true, cache: "no-store", timeoutMs: 180_000 }),
  deleteIdea: (id: string) => request<void>(`${S}/ideas/${encodeURIComponent(id)}`, { method: "DELETE", admin: true, cache: "no-store" }),
  posts: () => request<Post[]>(`${S}/posts`, get),
  post: (id: string) => request<Post>(`${S}/posts/${encodeURIComponent(id)}`, get),
  createPost: (input: unknown) => request<Post>(`${S}/posts`, json("POST", input)),
  updatePost: (id: string, input: unknown) => request<Post>(`${S}/posts/${encodeURIComponent(id)}`, json("PUT", input)),
  deletePost: (id: string) => request<void>(`${S}/posts/${encodeURIComponent(id)}`, { method: "DELETE", admin: true, cache: "no-store" }),
  // Writing, scoring and the automatic second pass can take a couple of minutes on Claude.
  write: (input: unknown) => request<PostWriteResult>(`${S}/posts/write`, json("POST", input, 230_000)),
  scorePost: (input: { linkedin: string; x: string; role: string }) => request<CopyScore>(`${S}/posts/score`, json("POST", input, 120_000)),
  results: () => request<ResultsSummary>(`${S}/results`, get),
  experiments: () => request<Experiment[]>(`${S}/experiments`, get),
  createExperiment: (input: unknown) => request<Experiment>(`${S}/experiments`, json("POST", input)),
  updateExperiment: (id: string, input: unknown) => request<Experiment>(`${S}/experiments/${encodeURIComponent(id)}`, json("PUT", input)),
  deleteExperiment: (id: string) => request<void>(`${S}/experiments/${encodeURIComponent(id)}`, { method: "DELETE", admin: true, cache: "no-store" }),
  playbook: () => request<Playbook>(`${S}/playbook`, get),
  savePlaybook: (rules: string) => request<Playbook>(`${S}/playbook`, json("PUT", { rules })),
  articles: () => request<ArticleWork[]>(`${S}/articles`, get),
  article: (id: string) => request<ArticleWork>(`${S}/articles/${encodeURIComponent(id)}`, get),
  createArticle: (input: unknown) => request<ArticleWork>(`${S}/articles`, json("POST", input)),
  updateArticle: (id: string, input: unknown) => request<ArticleWork>(`${S}/articles/${encodeURIComponent(id)}`, json("PUT", input)),
  deleteArticle: (id: string) => request<void>(`${S}/articles/${encodeURIComponent(id)}`, { method: "DELETE", admin: true, cache: "no-store" }),
  // AI steps: web research and drafting can each take a minute or two.
  outline: (id: string) => request<ArticleWork>(`${S}/articles/${encodeURIComponent(id)}/outline`, json("POST", {}, 120_000)),
  research: (id: string, input: { section: string; query: string }) => request<{ work: ArticleWork; added: number; skipped: number }>(`${S}/articles/${encodeURIComponent(id)}/research`, json("POST", input, 180_000)),
  draft: (id: string) => request<{ work: ArticleWork; content: Content }>(`${S}/articles/${encodeURIComponent(id)}/draft`, json("POST", {}, 230_000)),
  check: (id: string) => request<ArticleWork>(`${S}/articles/${encodeURIComponent(id)}/check`, json("POST", {}, 230_000)),
  sources: () => request<LibrarySource[]>(`${S}/sources`, get),
  // Extraction reads the whole paste, then every link is checked: allow a few minutes for long reports.
  previewImport: (text: string, label: string) => request<{ candidates: ImportCandidate[]; dropped: number }>(`${S}/sources/import/preview`, json("POST", { text, label }, 240_000)),
  saveImport: (items: ImportCandidate[], label: string) => request<{ created: number; merged: number }>(`${S}/sources/import`, json("POST", { items, label })),
  updateSource: (id: string, input: unknown) => request<LibrarySource>(`${S}/sources/${encodeURIComponent(id)}`, json("PUT", input)),
  checkSource: (id: string) => request<LibrarySource>(`${S}/sources/${encodeURIComponent(id)}/check`, json("POST", {}, 30_000)),
  checkSources: () => request<LibrarySource[]>(`${S}/sources/check`, json("POST", {}, 120_000)),
  deleteSource: (id: string) => request<void>(`${S}/sources/${encodeURIComponent(id)}`, { method: "DELETE", admin: true, cache: "no-store" }),
  distribute: (id: string) => request<Post[]>(`${S}/articles/${encodeURIComponent(id)}/distribute`, json("POST", {}, 230_000)),
  polish: (id: string) => request<{ work: ArticleWork; content: Content }>(`${S}/articles/${encodeURIComponent(id)}/polish`, json("POST", {}, 230_000)),
};
