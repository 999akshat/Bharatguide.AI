import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TARGET_LANGUAGES } from "@/lib/languages";

const MAX_CHARS = 60_000;

const TranslateInput = z.object({
  fileName: z.string().min(1).max(300),
  pageCount: z.number().int().min(0).max(5000),
  text: z.string().min(20),
  targetLanguage: z.enum(["hi", "ta", "te", "bn"]),
});

interface AiSteps {
  source_language: string;
  summary: string;
  steps: Array<{
    index: number;
    title: string;
    text: string;
    original_excerpt: string;
    visual_prompt: string;
  }>;
}

const STEPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["source_language", "summary", "steps"],
  properties: {
    source_language: { type: "string" },
    summary: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "title", "text", "original_excerpt", "visual_prompt"],
        properties: {
          index: { type: "integer" },
          title: { type: "string" },
          text: { type: "string" },
          original_excerpt: { type: "string" },
          visual_prompt: { type: "string" },
        },
      },
    },
  },
} as const;

export const translateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TranslateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { generateStructured, AiGatewayError } = await import("@/lib/ai.server");

    const language = TARGET_LANGUAGES.find((entry) => entry.code === data.targetLanguage)!;
    const source = data.text.slice(0, MAX_CHARS);

    let result: AiSteps;
    try {
      result = await generateStructured<AiSteps>({
        schemaName: "translated_steps",
        schema: STEPS_SCHEMA as unknown as Record<string, unknown>,
        reasoningEffort: "low",
        instructions: [
          "You convert documents of any language into clear, ordered, actionable steps",
          `translated into ${language.englishName} (${language.nativeName}, ${language.script} script).`,
          "Rules:",
          `1. Every "title" and "text" MUST be written in ${language.englishName} using the ${language.script} script only.`,
          "2. Split the document into 3-15 sequential steps a person can follow. Merge trivia, drop boilerplate.",
          '3. "text" is 1-3 short sentences of plain, simple instruction.',
          '4. "original_excerpt" is a short verbatim quote (max 160 chars) from the source document for that step, in its original language.',
          '5. "visual_prompt" is ALWAYS in English and describes a filmable 3D animated scene that illustrates the step:',
          "   the character, the exact action, the objects/devices involved, the setting and the camera move.",
          '   Example: for "install the app from the Play Store", write "A friendly 3D animated young woman sits on a sofa holding',
          '   a smartphone, opens an app store on the screen and taps the install button; the progress ring fills; camera slowly',
          '   pushes in over her shoulder toward the phone screen."',
          '6. "source_language" is the English name of the document\'s original language.',
          `7. "summary" is one sentence describing the document, written in ${language.englishName}.`,
          "8. Steps are numbered from 1 in reading order.",
        ].join("\n"),
        input: `Document file name: ${data.fileName}\n\nDocument text:\n${source}`,
      });
    } catch (error) {
      if (error instanceof AiGatewayError) {
        if (error.status === 402) {
          throw new Error("AI credits are exhausted. Please top up to keep translating.");
        }
        if (error.status === 429) {
          throw new Error("The AI service is busy right now. Please try again in a moment.");
        }
        throw new Error(error.message);
      }
      throw error;
    }

    const steps = (result.steps ?? [])
      .filter((step) => step.title?.trim() && step.text?.trim())
      .slice(0, 30);

    if (steps.length === 0) {
      throw new Error("No readable instructions were found in this PDF.");
    }

    const { data: document, error: documentError } = await context.supabase
      .from("documents")
      .insert({
        user_id: context.userId,
        file_name: data.fileName,
        page_count: data.pageCount,
        source_language: result.source_language ?? null,
        target_language: data.targetLanguage,
        summary: result.summary ?? null,
        original_text: source,
      })
      .select("id")
      .single();

    if (documentError || !document) {
      throw new Error(documentError?.message ?? "Could not save this document.");
    }

    const { error: stepsError } = await context.supabase.from("steps").insert(
      steps.map((step, position) => ({
        document_id: document.id,
        user_id: context.userId,
        step_index: position + 1,
        title: step.title.trim(),
        body: step.text.trim(),
        original_excerpt: step.original_excerpt?.slice(0, 300) ?? null,
        visual_prompt: step.visual_prompt?.trim() ?? "",
      })),
    );

    if (stepsError) throw new Error(stepsError.message);

    return { documentId: document.id as string, stepCount: steps.length };
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("documents")
      .select("id, file_name, page_count, source_language, target_language, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: document, error } = await context.supabase
      .from("documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!document) throw new Error("Document not found.");

    const { data: steps, error: stepsError } = await context.supabase
      .from("steps")
      .select("*")
      .eq("document_id", data.id)
      .order("step_index", { ascending: true });
    if (stepsError) throw new Error(stepsError.message);

    return { document, steps: steps ?? [] };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
