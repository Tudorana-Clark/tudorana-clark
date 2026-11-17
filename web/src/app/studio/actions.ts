"use server";

import { updateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { fail, requireSession } from "@/lib/action-helpers";
import { admin, CONTENT_TAG } from "@/lib/api";
import { env, passwordLoginEnabled } from "@/lib/env";
import { createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import type { ActionResult, Content, ContentInput, CoverResult, SeoSuggestion } from "@/lib/types";

// ---------- Session ----------

const failedLogins = new Map<string, { count: number; until: number }>();

export async function loginAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  if (!passwordLoginEnabled()) return { ok: false, error: "Password sign-in is turned off. Use “Continue with Microsoft”." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const lock = failedLogins.get(ip);
  if (lock && lock.until > Date.now()) return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };

  const password = String(form.get("password") ?? "");
  if (!(await passwordMatches(password, env.ADMIN_PASSWORD, env.SESSION_SECRET))) {
    const count = (lock?.count ?? 0) + 1;
    failedLogins.set(ip, { count, until: count >= 5 ? Date.now() + 5 * 60_000 : 0 });
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { ok: false, error: "That password isn’t right." };
  }
  failedLogins.delete(ip);
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(env.SESSION_SECRET), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  const next = String(form.get("next") ?? "/studio");
  redirect(next.startsWith("/studio") ? next : "/studio");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/studio/login");
}

// ---------- Content ----------

const imageSchema = z.object({ url: z.url(), alt: z.string().max(300), width: z.number().int().nullish(), height: z.number().int().nullish() });

const inputSchema = z.object({
  kind: z.enum(["article", "research", "note", "talk", "video"]),
  title: z.string().trim().min(1, "Add a title before saving.").max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "The address can only use lowercase letters, numbers and single hyphens.")
    .max(120)
    .nullish()
    .or(z.literal("").transform(() => null)),
  subtitle: z.string().max(300),
  excerpt: z.string().max(400),
  body: z.string().max(200_000),
  category: z.string().max(300),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  feature_image: imageSchema.nullable(),
  cover: z.object({ style_version: z.string().min(1).max(40), model: z.string().min(1).max(120), concept: z.string().max(300), generated_at: z.string().min(1) }).nullable(),
  featured: z.boolean(),
  seo: z.object({
    meta_title: z.string().max(70, "Meta title must be 70 characters or fewer."),
    meta_description: z.string().max(170, "Meta description must be 170 characters or fewer."),
    keywords: z.array(z.string().max(300)).max(15),
    tldr: z.string().max(600),
    key_takeaways: z.array(z.string().max(300)).max(7),
    faq: z.array(z.object({ question: z.string().max(300), answer: z.string().max(1200) })).max(8),
    entities: z.array(z.string().max(300)).max(15),
  }),
  social: z.object({ linkedin: z.string().max(3000), x: z.string().max(280, "X posts must be 280 characters or fewer."), facebook: z.string().max(2000), threads: z.string().max(500), bluesky: z.string().max(300) }),
  event: z.object({ name: z.string().min(1, "Add the event name."), date: z.string().min(1, "Add the event date."), location: z.string(), url: z.url().nullish().or(z.literal("").transform(() => null)) }).nullable(),
  video: z.object({ embed_url: z.url("Add a valid video embed URL."), duration_iso: z.string().nullish().or(z.literal("").transform(() => null)), thumbnail: imageSchema.nullish() }).nullable(),
  research: z
    .object({
      pdf_url: z.url().nullish().or(z.literal("").transform(() => null)),
      carousel_url: z.url().nullish().or(z.literal("").transform(() => null)),
      institution: z.string(),
      citation: z.string().max(1000),
      stats: z.array(z.object({ value: z.string().max(40), label: z.string().max(300) })).max(8),
    })
    .nullable(),
});

function clean(input: ContentInput) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Check the form.", field: issue?.path.join(".") };
  }
  const d = parsed.data;
  // Only keep the kind-specific block that applies; drop empty FAQ rows and stats.
  return {
    data: {
      ...d,
      // A cover record only describes an AI image; never keep it without one.
      cover: d.feature_image ? d.cover : null,
      seo: { ...d.seo, faq: d.seo.faq.filter((f) => f.question && f.answer), key_takeaways: d.seo.key_takeaways.filter(Boolean) },
      event: d.kind === "talk" || d.kind === "video" ? d.event : null,
      video: d.kind === "video" ? d.video : null,
      research: d.kind === "research" ? { ...d.research!, stats: (d.research?.stats ?? []).filter((s) => s.value && s.label) } : null,
    },
  };
}

export async function saveContentAction(id: string | null, input: ContentInput, publish: boolean): Promise<ActionResult<Content>> {
  await requireSession();
  const cleaned = clean(input);
  if ("error" in cleaned) return { ok: false, error: cleaned.error ?? "Check the form.", field: cleaned.field };
  try {
    let saved = id ? await admin.update(id, cleaned.data) : await admin.create(cleaned.data);
    if (publish && saved.status !== "published") saved = await admin.setStatus(saved.id, "publish");
    if (saved.status === "published") updateTag(CONTENT_TAG);
    const message = publish ? (saved.published_at === saved.updated_at ? "Published. It’s live now." : "Changes are live.") : saved.status === "published" ? "Changes are live." : "Draft saved.";
    return { ok: true, data: saved, message };
  } catch (err) {
    return fail(err);
  }
}

export async function setStatusAction(id: string, status: "publish" | "unpublish"): Promise<ActionResult<Content>> {
  await requireSession();
  try {
    const saved = await admin.setStatus(id, status);
    updateTag(CONTENT_TAG);
    return { ok: true, data: saved, message: status === "publish" ? "Published. It’s live now." : "Unpublished. It’s back to a draft and hidden from the site." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteContentAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await admin.remove(id);
    updateTag(CONTENT_TAG);
  } catch (err) {
    return fail(err);
  }
  redirect("/studio?deleted=1");
}

export async function generateSeoAction(input: { kind: ContentInput["kind"]; title: string; body: string; category: string }): Promise<ActionResult<SeoSuggestion>> {
  await requireSession();
  if (!input.title.trim()) return { ok: false, error: "Add a title first so the AI knows what the piece is about." };
  if (input.body.trim().split(/\s+/).length < 40) return { ok: false, error: "Write at least a few paragraphs (40+ words) for useful SEO suggestions." };
  try {
    return { ok: true, data: await admin.seo(input), message: "SEO, summary and social posts generated. Review and edit before publishing." };
  } catch (err) {
    return fail(err);
  }
}

const coverSchema = z.object({
  kind: z.enum(["article", "research", "note", "talk", "video"]),
  title: z.string().trim().min(1, "Add a title first so the cover matches the piece.").max(200),
  body: z.string().max(200_000),
  category: z.string().max(300),
  concept: z.string().trim().max(300, "Keep the cover idea under 300 characters."),
  literal: z.boolean(),
});

export async function generateCoversAction(input: z.input<typeof coverSchema>): Promise<ActionResult<CoverResult>> {
  await requireSession();
  const parsed = coverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the cover idea." };
  try {
    const data = await admin.covers(parsed.data);
    const n = data.candidates.length;
    const message = data.failed ? `${n} of ${n + data.failed} options rendered. Pick one, or generate again.` : `${n} options ready. Pick one to use it.`;
    return { ok: true, data, message };
  } catch (err) {
    return fail(err);
  }
}

export async function uploadMediaAction(form: FormData): Promise<ActionResult<{ url: string; content_type: string }>> {
  await requireSession();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "That file is over 10 MB. Please upload a smaller one." };
  const out = new FormData();
  out.set("file", file, file.name);
  try {
    const res = await admin.upload(out);
    return { ok: true, data: { url: res.url, content_type: res.content_type }, message: "Uploaded." };
  } catch (err) {
    return fail(err);
  }
}
