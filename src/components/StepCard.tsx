import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Clapperboard, Download, Loader2, Quote, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { pollStepVideo, startStepVideo, type StepVideoState } from "@/lib/video.functions";
import type { TargetLanguage } from "@/lib/languages";

export interface StepRow {
  id: string;
  step_index: number;
  title: string;
  body: string;
  original_excerpt: string | null;
  visual_prompt: string;
  video_status: string;
  video_error: string | null;
}

export function StepCard({
  step,
  language,
  initialUrl,
}: {
  step: StepRow;
  language: TargetLanguage | undefined;
  initialUrl?: string | undefined;
}) {
  const start = useServerFn(startStepVideo);
  const poll = useServerFn(pollStepVideo);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<StepVideoState>({
    stepId: step.id,
    status:
      step.video_status === "ready"
        ? "ready"
        : step.video_status === "generating"
          ? "generating"
          : step.video_status === "failed"
            ? "failed"
            : "idle",
    progress: step.video_status === "ready" ? 100 : step.video_status === "generating" ? 20 : 0,
    url: initialUrl ?? null,
    error: step.video_error,
  });

  useEffect(() => {
    if (state.status !== "generating") return;
    let cancelled = false;

    const tick = async () => {
      try {
        const next = await poll({ data: { stepId: step.id } });
        if (cancelled) return;
        setState(next);
        if (next.status === "generating") {
          timer.current = setTimeout(() => void tick(), 7000);
        } else if (next.status === "failed" && next.error) {
          toast.error(next.error);
        } else if (next.status === "ready") {
          toast.success(`Step ${step.step_index}: 3D video is ready`);
        }
      } catch {
        if (!cancelled) timer.current = setTimeout(() => void tick(), 10000);
      }
    };

    timer.current = setTimeout(() => void tick(), 5000);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state.status, poll, step.id, step.step_index]);

  async function handleGenerate() {
    setState((current) => ({ ...current, status: "generating", progress: 5, error: null }));
    try {
      const next = await start({ data: { stepId: step.id } });
      setState(next);
      if (next.status === "generating") {
        toast.info("Rendering the 3D scene — this usually takes 1–3 minutes.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the video.";
      setState((current) => ({ ...current, status: "failed", progress: 0, error: message }));
      toast.error(message);
    }
  }

  return (
    <article className="panel overflow-hidden">
      <div className="flex flex-col gap-4 p-6 sm:flex-row">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 font-display text-base font-semibold text-primary">
          {step.step_index}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className={`text-lg font-semibold leading-snug ${language?.fontClass ?? ""}`}>
            {step.title}
          </h3>
          <p
            className={`mt-2 text-[15px] leading-relaxed text-foreground/90 ${language?.fontClass ?? ""}`}
          >
            {step.body}
          </p>

          {step.original_excerpt ? (
            <p className="mt-3 flex gap-2 rounded-lg border border-border/70 bg-surface-raised px-3 py-2 text-xs text-muted-foreground">
              <Quote className="mt-0.5 size-3.5 shrink-0" />
              <span className="italic">{step.original_excerpt}</span>
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {state.status === "generating" ? (
              <div className="flex w-full max-w-sm items-center gap-3">
                <Progress value={state.progress} className="h-2 flex-1" />
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Rendering 3D scene
                </span>
              </div>
            ) : state.status === "ready" ? (
              <Button variant="outline" size="sm" asChild>
                <a href={state.url ?? "#"} download={`step-${step.step_index}.mp4`}>
                  <Download className="size-4" /> Download video
                </a>
              </Button>
            ) : (
              <Button size="sm" onClick={() => void handleGenerate()}>
                {state.status === "failed" ? (
                  <RotateCcw className="size-4" />
                ) : (
                  <Clapperboard className="size-4" />
                )}
                {state.status === "failed" ? "Try again" : "Generate 3D video"}
              </Button>
            )}
          </div>

          {state.status === "failed" && state.error ? (
            <p className="mt-3 flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {state.error}
            </p>
          ) : null}

          {step.visual_prompt ? (
            <details className="mt-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">3D scene description</summary>
              <p className="mt-2 leading-relaxed">{step.visual_prompt}</p>
            </details>
          ) : null}
        </div>
      </div>

      {state.status === "ready" && state.url ? (
        <div className="border-t border-border/70 bg-background/40 p-4">
          <video
            src={state.url}
            controls
            playsInline
            className="w-full rounded-lg border border-border/70"
          />
        </div>
      ) : null}
    </article>
  );
}
