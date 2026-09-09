import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "generated-videos";
const StepId = z.object({ stepId: z.string().uuid() });

export interface StepVideoState {
  stepId: string;
  status: "idle" | "generating" | "ready" | "failed";
  progress: number;
  url: string | null;
  error: string | null;
}

async function signedUrl(
  supabase: { storage: { from: (b: string) => { createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null }> } } },
  path: string,
): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? null;
}

/** Starts one 3D video generation job for a step. Only ever called from an explicit user click. */
export const startStepVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StepId.parse(input))
  .handler(async ({ data, context }): Promise<StepVideoState> => {
    const { createVideoJob, buildThreeDPrompt, rewriteVisualPromptForSafety, AiGatewayError } =
      await import("@/lib/ai.server");

    const { data: step, error } = await context.supabase
      .from("steps")
      .select("id, title, body, visual_prompt, video_status, video_path, video_error")
      .eq("id", data.stepId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!step) throw new Error("Step not found.");

    if (step.video_status === "generating") {
      return { stepId: step.id, status: "generating", progress: 5, url: null, error: null };
    }
    if (step.video_status === "ready" && step.video_path) {
      return {
        stepId: step.id,
        status: "ready",
        progress: 100,
        url: await signedUrl(context.supabase, step.video_path),
        error: null,
      };
    }

    // Only one job at a time per user keeps us inside the gateway's concurrency limit.
    const { data: running } = await context.supabase
      .from("steps")
      .select("id")
      .eq("video_status", "generating")
      .limit(1);
    if (running && running.length > 0) {
      throw new Error("Another 3D video is still rendering. Please wait for it to finish.");
    }

    const prompt = buildThreeDPrompt(step.visual_prompt ?? "", step.title);

    let jobId: string;
    try {
      jobId = await createVideoJob(prompt);
    } catch (err) {
      const message =
        err instanceof AiGatewayError
          ? err.status === 402
            ? "AI credits are exhausted, so the 3D video could not be started."
            : err.status === 429
              ? "The video service is busy. Please try again in a minute."
              : err.message
          : "The 3D video could not be started.";
      await context.supabase
        .from("steps")
        .update({ video_status: "failed", video_error: message })
        .eq("id", step.id);
      throw new Error(message);
    }

    await context.supabase
      .from("steps")
      .update({ video_status: "generating", video_job_id: jobId, video_error: null })
      .eq("id", step.id);

    return { stepId: step.id, status: "generating", progress: 5, url: null, error: null };
  });

/** Polls a running job; on completion the MP4 is copied into permanent storage. */
export const pollStepVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StepId.parse(input))
  .handler(async ({ data, context }): Promise<StepVideoState> => {
    const { getVideoJob, downloadVideo, AiGatewayError } = await import("@/lib/ai.server");

    const { data: step, error } = await context.supabase
      .from("steps")
      .select("id, video_status, video_job_id, video_path, video_error")
      .eq("id", data.stepId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!step) throw new Error("Step not found.");

    if (step.video_status === "ready" && step.video_path) {
      return {
        stepId: step.id,
        status: "ready",
        progress: 100,
        url: await signedUrl(context.supabase, step.video_path),
        error: null,
      };
    }
    if (step.video_status !== "generating" || !step.video_job_id) {
      return {
        stepId: step.id,
        status: step.video_status === "failed" ? "failed" : "idle",
        progress: 0,
        url: null,
        error: step.video_error ?? null,
      };
    }

    let job;
    try {
      job = await getVideoJob(step.video_job_id);
    } catch (err) {
      if (err instanceof AiGatewayError && err.status >= 500) {
        return { stepId: step.id, status: "generating", progress: 40, url: null, error: null };
      }
      const message = err instanceof Error ? err.message : "Video generation failed.";
      await context.supabase
        .from("steps")
        .update({ video_status: "failed", video_error: message })
        .eq("id", step.id);
      return { stepId: step.id, status: "failed", progress: 0, url: null, error: message };
    }

    if (job.status === "failed") {
      const message =
        job.error?.code === "moderation_blocked"
          ? "This step's scene was blocked by the content filter. Try editing the step wording."
          : (job.error?.message ?? "Video generation failed.");
      await context.supabase
        .from("steps")
        .update({ video_status: "failed", video_error: message })
        .eq("id", step.id);
      return { stepId: step.id, status: "failed", progress: 0, url: null, error: message };
    }

    if (job.status !== "completed") {
      return {
        stepId: step.id,
        status: "generating",
        progress: Math.max(5, Math.min(95, job.progress ?? 30)),
        url: null,
        error: null,
      };
    }

    const bytes = await downloadVideo(step.video_job_id);
    const path = `${context.userId}/${step.id}.mp4`;
    const { error: uploadError } = await context.supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });

    if (uploadError) {
      await context.supabase
        .from("steps")
        .update({ video_status: "failed", video_error: uploadError.message })
        .eq("id", step.id);
      return { stepId: step.id, status: "failed", progress: 0, url: null, error: uploadError.message };
    }

    await context.supabase
      .from("steps")
      .update({ video_status: "ready", video_path: path, video_error: null })
      .eq("id", step.id);

    return {
      stepId: step.id,
      status: "ready",
      progress: 100,
      url: await signedUrl(context.supabase, path),
      error: null,
    };
  });

/** Fresh signed URLs for already-generated videos of a document. */
export const getDocumentVideoUrls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: steps, error } = await context.supabase
      .from("steps")
      .select("id, video_path")
      .eq("document_id", data.documentId)
      .eq("video_status", "ready");
    if (error) throw new Error(error.message);

    const entries: Record<string, string> = {};
    for (const step of steps ?? []) {
      if (!step.video_path) continue;
      const url = await signedUrl(context.supabase, step.video_path);
      if (url) entries[step.id] = url;
    }
    return entries;
  });
