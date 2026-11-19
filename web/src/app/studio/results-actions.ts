"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, requireSession } from "@/lib/action-helpers";
import { studio } from "@/lib/api";
import type { ActionResult, Experiment } from "@/lib/types";

const experimentSchema = z.object({
  name: z.string().trim().min(1, "Name the experiment.").max(120, "Keep the name under 120 characters."),
  variable: z.string().trim().max(120, "Keep the variable under 120 characters."),
  hypothesis: z.string().trim().max(600, "Keep the hypothesis under 600 characters."),
  arms: z
    .array(z.string().trim().min(1, "Arms can’t be blank.").max(40, "Keep each arm under 40 characters."))
    .min(2, "An experiment needs at least two arms.")
    .max(4, "Use four arms at most; more needs far more posts.")
    .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, "Give each arm a different name."),
  status: z.enum(["running", "concluded"]),
  conclusion: z.string().trim().max(1000, "Keep the conclusion under 1,000 characters."),
});

type ExperimentForm = z.input<typeof experimentSchema>;

function invalid(err: z.ZodError): { ok: false; error: string; field?: string } {
  const issue = err.issues[0];
  return { ok: false, error: issue?.message ?? "Check the experiment.", field: issue?.path.join(".") };
}

export async function createExperimentAction(input: ExperimentForm): Promise<ActionResult<Experiment>> {
  await requireSession();
  const parsed = experimentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const data = await studio.createExperiment(parsed.data);
    revalidatePath("/studio/results");
    return { ok: true, data, message: "Experiment started. Tag posts with it from the post editor." };
  } catch (err) {
    return fail(err);
  }
}

export async function updateExperimentAction(id: string, input: ExperimentForm): Promise<ActionResult<Experiment>> {
  await requireSession();
  const parsed = experimentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const data = await studio.updateExperiment(id, parsed.data);
    revalidatePath("/studio/results");
    return { ok: true, data, message: data.status === "concluded" ? "Experiment concluded." : "Experiment updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteExperimentAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await studio.deleteExperiment(id);
    revalidatePath("/studio/results");
    return { ok: true, data: undefined, message: "Experiment deleted. Its posts keep their results." };
  } catch (err) {
    return fail(err);
  }
}
