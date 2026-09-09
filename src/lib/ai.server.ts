/**
 * Server-only helpers for the Lovable AI Gateway.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export class AiGatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AiGatewayError";
  }
}

function requireKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project yet.");
  return key;
}

async function readGatewayError(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: { message?: string } };
    return parsed.message ?? parsed.error?.message ?? raw.slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
}

/**
 * Streamed structured-output call against /v1/responses.
 * Streaming is mandatory on reasoning models: it keeps bytes flowing so the
 * request survives platform timeouts. We consume the stream server-side and
 * return the parsed JSON object.
 */
export async function generateStructured<T>(options: {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  reasoningEffort?: "low" | "medium" | "high";
}): Promise<T> {
  const key = requireKey();

  const res = await fetch(`${GATEWAY}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      instructions: options.instructions,
      input: options.input,
      stream: true,
      store: false,
      reasoning: { effort: options.reasoningEffort ?? "low", summary: "auto" },
      text: {
        format: {
          type: "json_schema",
          name: options.schemaName,
          strict: true,
          schema: options.schema,
        },
      },
    }),
  });

  if (!res.ok) {
    throw new AiGatewayError(res.status, await readGatewayError(res));
  }
  if (!res.body) throw new AiGatewayError(502, "The AI service returned an empty response.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: {
        type?: string;
        delta?: string;
        response?: { output_text?: string; error?: { message?: string } };
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        text += event.delta;
      }
      if (event.type === "response.failed" || event.type === "error") {
        throw new AiGatewayError(502, event.response?.error?.message ?? "The AI request failed.");
      }
      if (event.type === "response.completed" && !text && event.response?.output_text) {
        text = event.response.output_text;
      }
    }
  }

  if (!text.trim()) {
    throw new AiGatewayError(502, "The AI service returned no result. Please try again.");
  }

  return JSON.parse(text) as T;
}

export async function createVideoJob(prompt: string): Promise<string> {
  const key = requireKey();
  const res = await fetch(`${GATEWAY}/videos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "google/gemini-omni-1.1-flash",
      input: prompt,
      response_format: {
        type: "video",
        resolution: "720p",
        duration: "8s",
        aspect_ratio: "16:9",
      },
    }),
  });

  if (!res.ok) {
    throw new AiGatewayError(res.status, await readGatewayError(res));
  }
  const job = (await res.json()) as { id: string };
  return job.id;
}

export interface VideoJobStatus {
  status: string;
  progress?: number;
  error?: { code?: string; message?: string };
}

export async function getVideoJob(jobId: string): Promise<VideoJobStatus> {
  const key = requireKey();
  const res = await fetch(`${GATEWAY}/videos/${jobId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new AiGatewayError(res.status, await readGatewayError(res));
  }
  return (await res.json()) as VideoJobStatus;
}

export async function downloadVideo(jobId: string): Promise<ArrayBuffer> {
  const key = requireKey();
  const res = await fetch(`${GATEWAY}/videos/${jobId}/content`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new AiGatewayError(res.status, await readGatewayError(res));
  }
  return await res.arrayBuffer();
}

/** Turns a step's plain visual description into a 3D-animation render brief. */
export function buildThreeDPrompt(visualPrompt: string, stepTitle: string): string {
  return [
    "Stylized 3D animated short, Pixar-like character animation, cinematic soft studio lighting,",
    "smooth subsurface-scattering skin, clean uncluttered environment, shallow depth of field,",
    "in a single continuous shot with gentle camera movement.",
    `Scene: ${visualPrompt || stepTitle}`,
    "The character clearly performs the action from start to finish so the instruction is easy to follow.",
    "No on-screen text, no captions, no watermarks, no logos, no dialogue. Soft ambient background music only.",
    "Consider micro-detail, facial expression and timing.",
  ].join(" ");
}

/**
 * Rewrites a scene description that the video model's safety filter rejected
 * into a neutral, clearly-animated version, keeping the same action.
 */
export async function rewriteVisualPromptForSafety(
  visualPrompt: string,
  stepTitle: string,
): Promise<string> {
  const result = await generateStructured<{ visual_prompt: string }>({
    instructions: [
      "You rewrite short scene descriptions for a family-friendly 3D animation model.",
      "Keep the same instructional action, but remove anything a safety filter may flag:",
      "bathrooms, sinks, mouths, spitting, bodily fluids, undressing, faces close to the camera,",
      "children, medical or intimate detail, brand names and real people.",
      "Prefer a neutral room, an adult cartoon character shown at a medium distance,",
      "simple props and clearly stylized animation. One or two sentences, English only.",
    ].join(" "),
    input: `Step title: ${stepTitle}\nScene: ${visualPrompt}`,
    schemaName: "safe_visual_prompt",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["visual_prompt"],
      properties: { visual_prompt: { type: "string" } },
    },
  });
  return result.visual_prompt?.trim() || visualPrompt;
}
