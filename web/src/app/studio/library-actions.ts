"use server";

import { z } from "zod";

import { fail, requireSession } from "@/lib/action-helpers";
import { studio } from "@/lib/api";
import type { ActionResult, ImportCandidate, LibrarySource } from "@/lib/types";

const LINK = z.enum(["unchecked", "ok", "blocked", "broken"]);
const findingSchema = z.object({ text: z.string().trim().min(1).max(800), added_at: z.string() });
const sourceInSchema = z.object({
  url: z.url("Each source needs a valid link."),
  title: z.string().trim().min(1, "Give the source a title.").max(300),
  publisher: z.string().trim().min(1, "Name who published it.").max(300),
  published: z.string().trim().max(40),
  sponsor: z.string().trim().max(300),
  findings: z.array(findingSchema).max(20),
  themes: z.array(z.string().trim().min(1).max(40)).max(8),
  notes: z.string().max(1000),
});

export async function previewImportAction(text: string, label: string): Promise<ActionResult<{ candidates: ImportCandidate[]; dropped: number }>> {
  await requireSession();
  const parsed = z
    .object({ text: z.string().trim().min(20, "Paste the research first.").max(120_000, "That’s over 120,000 characters. Import it in two parts."), label: z.string().trim().max(120) })
    .safeParse({ text, label });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the paste." };
  try {
    const data = await studio.previewImport(parsed.data.text, parsed.data.label);
    const n = data.candidates.length;
    const message = n ? `${n} ${n === 1 ? "source" : "sources"} found.${data.dropped ? ` ${data.dropped} skipped because their link wasn’t in the text.` : ""} Untick any you don’t want, then save.` : "No usable sources found. Make sure the research includes its links.";
    return { ok: true, data, message };
  } catch (err) {
    return fail(err);
  }
}

export async function saveImportAction(items: ImportCandidate[], label: string): Promise<ActionResult<{ created: number; merged: number }>> {
  await requireSession();
  const parsed = z.array(z.object({ source: sourceInSchema, existing_id: z.string().nullable(), link_status: LINK })).min(1, "Select at least one source.").max(100).safeParse(items);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the sources." };
  try {
    const res = await studio.saveImport(parsed.data, label.trim().slice(0, 120));
    return { ok: true, data: res, message: `Saved ${res.created} new ${res.created === 1 ? "source" : "sources"}${res.merged ? ` and added findings to ${res.merged} you already had` : ""}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function updateSourceAction(id: string, input: z.input<typeof sourceInSchema>): Promise<ActionResult<LibrarySource>> {
  await requireSession();
  const parsed = sourceInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the source." };
  try {
    return { ok: true, data: await studio.updateSource(id, parsed.data), message: "Source updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function checkSourceAction(id: string): Promise<ActionResult<LibrarySource>> {
  await requireSession();
  try {
    const data = await studio.checkSource(id);
    return { ok: true, data, message: data.link_status === "ok" ? "The link works." : data.link_status === "blocked" ? "The site refused the check. Open it yourself to confirm." : "The link looks broken." };
  } catch (err) {
    return fail(err);
  }
}

export async function checkSourcesAction(): Promise<ActionResult<LibrarySource[]>> {
  await requireSession();
  try {
    const data = await studio.checkSources();
    const broken = data.filter((s) => s.link_status === "broken").length;
    return { ok: true, data, message: `Checked ${data.length} ${data.length === 1 ? "link" : "links"}${broken ? `; ${broken} look broken` : ""}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSourceAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await studio.deleteSource(id);
    return { ok: true, data: undefined, message: "Source removed from the library." };
  } catch (err) {
    return fail(err);
  }
}

export async function listSourcesAction(): Promise<ActionResult<LibrarySource[]>> {
  await requireSession();
  try {
    return { ok: true, data: await studio.sources() };
  } catch (err) {
    return fail(err);
  }
}
