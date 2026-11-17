/** Mirrors api/app/models.py. Keep the two in step. */

export const KINDS = ["article", "research", "note", "talk", "video"] as const;
export type Kind = (typeof KINDS)[number];
export type Status = "draft" | "published";

export interface Image {
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Stat {
  value: string;
  label: string;
}

export interface SeoPack {
  meta_title: string;
  meta_description: string;
  keywords: string[];
  tldr: string;
  key_takeaways: string[];
  faq: FaqItem[];
  entities: string[];
}

export interface SocialCopy {
  linkedin: string;
  x: string;
  facebook: string;
  threads: string;
  bluesky: string;
}

export interface EventInfo {
  name: string;
  date: string;
  location: string;
  url?: string | null;
}

export interface VideoInfo {
  embed_url: string;
  duration_iso?: string | null;
  thumbnail?: Image | null;
}

export interface ResearchInfo {
  pdf_url?: string | null;
  carousel_url?: string | null;
  institution: string;
  citation: string;
  stats: Stat[];
}

/** Provenance of an AI-generated cover; present only while feature_image is that cover. */
export interface CoverInfo {
  style_version: string;
  model: string;
  concept: string;
  generated_at: string;
}

export interface CoverCandidate {
  url: string;
  width: number;
  height: number;
}

export interface CoverResult {
  concept: string;
  style_version: string;
  model: string;
  alt: string;
  candidates: CoverCandidate[];
  failed: number;
}

export interface ContentInput {
  kind: Kind;
  title: string;
  slug?: string | null;
  subtitle: string;
  excerpt: string;
  body: string;
  category: string;
  tags: string[];
  feature_image: Image | null;
  cover: CoverInfo | null;
  featured: boolean;
  seo: SeoPack;
  social: SocialCopy;
  event: EventInfo | null;
  video: VideoInfo | null;
  research: ResearchInfo | null;
}

export interface Content extends ContentInput {
  id: string;
  slug: string;
  status: Status;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  reading_minutes: number;
  word_count: number;
}

export interface ContentSummary {
  id: string;
  kind: Kind;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  feature_image: Image | null;
  featured: boolean;
  status: Status;
  published_at: string | null;
  updated_at: string;
  reading_minutes: number;
  event?: EventInfo | null;
  video?: VideoInfo | null;
}

export interface SeoSuggestion {
  seo: SeoPack;
  social: SocialCopy;
  excerpt: string;
  tags: string[];
  slug: string;
  image_alt_hint: string;
}

export interface Subscriber {
  id: string;
  email: string;
  source: string;
  created_at: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  created_at: string;
}

/** Result shape every server action returns, so the UI can always render an outcome. */
export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string; field?: string };

export const emptySeo = (): SeoPack => ({ meta_title: "", meta_description: "", keywords: [], tldr: "", key_takeaways: [], faq: [], entities: [] });
export const emptySocial = (): SocialCopy => ({ linkedin: "", x: "", facebook: "", threads: "", bluesky: "" });

/** A fresh, valid draft for the studio editor. */
export function blankInput(kind: Kind = "article"): ContentInput {
  return { kind, title: "", slug: null, subtitle: "", excerpt: "", body: "", category: kind === "article" ? "Artificial Intelligence" : "", tags: [], feature_image: null, cover: null, featured: false, seo: emptySeo(), social: emptySocial(), event: null, video: null, research: null };
}

// ---------- Content studio ----------

export interface CoverBrief {
  label: string;
  scene: string;
  why: string;
}

export interface VoiceProfile {
  guide: string;
  learned_from: number;
  updated_at: string | null;
}

export interface SourceRef {
  content_id: string;
  kind: Kind;
  title: string;
  path: string;
}

export interface Idea {
  id: string;
  text: string;
  angle: string;
  source: SourceRef | null;
  used_by: string | null;
  created_at: string;
}

export type PostStatus = "draft" | "ready" | "posted";
export type PostVisual = "none" | "quote" | "image";

export interface PostCopy {
  linkedin: string;
  x: string;
  hook: string;
}

export interface PostInput extends PostCopy {
  seed: string;
  source: SourceRef | null;
  idea_id: string | null;
  visual: PostVisual;
  image: Image | null;
  cover: CoverInfo | null;
  status: PostStatus;
  role?: string;
  planned_for?: string | null;
}

export interface Post extends PostInput {
  id: string;
  created_at: string;
  updated_at: string;
  posted_at: string | null;
}

export function blankPost(seed = "", source: SourceRef | null = null, ideaId: string | null = null): PostInput {
  return { seed, source, idea_id: ideaId, linkedin: "", x: "", hook: "", visual: "quote", image: null, cover: null, status: "draft" };
}

// ---------- Article workbench ----------

export interface Playbook {
  rules: string;
  updated_at: string | null;
}

export interface OutlineSection {
  key: string;
  title: string;
  purpose: string;
  research: string;
}

export interface ArticleSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  published: string;
  sponsor: string;
  finding: string;
  section: string;
  selected: boolean;
  added_by: "research" | "author";
}

export interface ClaimCheck {
  claim: string;
  status: "sourced" | "unsourced" | "mismatch" | "experience";
  source_url: string;
  note: string;
}

export interface ArticleCheck {
  word_count: number;
  within_length: boolean;
  claims: ClaimCheck[];
  voice_issues: string[];
  guardrail_issues: string[];
  has_field_story: boolean;
  unmatched_numbers: string[];
  verdict: string;
  checked_at: string;
}

export interface ArticleWorkInput {
  insight: string;
  angle: string;
  headline: string;
  headline_options: string[];
  outline: OutlineSection[];
  sources: ArticleSource[];
  field_notes: string;
  source_ref: SourceRef | null;
  idea_id: string | null;
}

export interface ArticleWork extends ArticleWorkInput {
  id: string;
  content_id: string | null;
  check: ArticleCheck | null;
  distributed: string[];
  created_at: string;
  updated_at: string;
}
