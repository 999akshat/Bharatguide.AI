# PDF → Regional Language Steps → 3D Animated Videos

A web app where you upload a PDF in any language, pick Hindi, Tamil, Telugu or Bengali, get the document rewritten as clear numbered steps in that language, and generate a short 3D-animated video for any step.

## What the user sees

1. **Upload page** — drag-and-drop a PDF (any language). Shows file name, page count, and a detected-language note.
2. **Four language buttons** — Hindi (हिंदी), Tamil (தமிழ்), Telugu (తెలుగు), Bengali (বাংলা). Picking one translates the document.
3. **Steps view** — the document broken into ordered steps, each a card with the translated instruction text (in the correct Indic script and font) plus the original line for reference.
4. **Per-step "Generate 3D video" button** — creates a short 3D-animated clip illustrating that step (e.g. a step about installing an app renders a 3D character installing it from the Play Store on a phone). Progress indicator while it renders, then an inline player with download.
5. **History** — past documents and their generated videos stay available after reload.

## How it works

- **PDF text extraction**: the PDF is read in the browser with `pdfjs-dist` (works for any language/script) and the text is sent to the server for processing. Scanned/image-only PDFs are detected and reported with a clear message instead of silently producing nothing.
- **Translate + step-split in one AI pass**: a server function calls Lovable AI with a strict JSON schema returning `{ steps: [{ index, title, text, visual_prompt }] }`. `visual_prompt` is an English 3D-animation description the model writes for each step (subject, action, setting, camera), which is what makes the video match the instruction.
- **3D video generation**: each step's `visual_prompt` is expanded into a 3D-render style prompt ("stylized 3D animated character, Pixar-like lighting, single continuous shot, no text overlays") and sent to the Lovable AI video model as an async job. The UI polls until the clip is done, then the MP4 is stored in Cloud storage and served from there (generated clips expire at the source, so they are copied immediately).
- **Blender note**: Blender cannot run in this hosting environment (no desktop/native renderer), so the 3D animation is produced by the AI 3D-video model instead. The visual result is the same kind of stylized 3D animation, generated per step.
- **Cost guard**: video generation is expensive, so it only ever starts from an explicit button click, one job at a time, with a queue and clear error messages if credits run out.

## Data (Lovable Cloud)

Cloud is enabled for login-free-but-persistent storage:
- `documents` — file name, source language, target language, created date, owner.
- `steps` — document reference, order, translated title/text, English visual prompt, video status, stored video path.
- `generated-videos` private storage bucket, served via signed URLs.

Sign-in with email is added so each person only sees their own documents and videos.

## Technical details

- TypeScript throughout; TanStack Start server functions for AI calls (`src/lib/translate.functions.ts`, `src/lib/video.functions.ts`), Cloud/Postgres with row-level security per user.
- Chat/translation: `openai/gpt-6-astra` via the gateway Responses API, streamed, strict JSON schema output.
- Video: `google/gemini-omni-1.1-flash`, 720p, 8s, created via one server function and polled by a second that stores the finished MP4.
- Indic typography: Noto Sans Devanagari / Tamil / Telugu / Bengali loaded in the root route head so all four scripts render correctly.
- Design: dark professional workspace theme with a document-teal accent, all tokens in `src/styles.css`.

## Build order

1. Enable Cloud, migrations + storage bucket + auth.
2. Design system, upload page, PDF text extraction.
3. Translation server function + steps view with the four language buttons.
4. Video generation server functions, polling, player, storage.
5. History page, error states, SEO/head metadata.
