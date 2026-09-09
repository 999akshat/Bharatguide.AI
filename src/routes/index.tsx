import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Film, Loader2, Sparkles, Upload, Wand2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { translateDocument } from "@/lib/documents.functions";
import { TARGET_LANGUAGES, type TargetLanguageCode } from "@/lib/languages";
import { extractPdfText } from "@/lib/pdf-text";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BharatGuide-AI — PDF to Hindi, Tamil, Telugu & Bengali steps" },
      {
        name: "description",
        content:
          "Upload a PDF in any language, get step-by-step instructions in Hindi, Tamil, Telugu or Bengali, and generate a 3D animated video for every step.",
      },
      { property: "og:title", content: "BharatGuide-AI — PDF to regional-language steps" },
      {
        property: "og:description",
        content:
          "Translate any PDF into four Indian languages as clear steps, each with its own 3D animated explainer video.",
      },
    ],
  }),
  component: UploadPage,
});

interface LoadedPdf {
  file: File;
  text: string;
  pageCount: number;
}

function UploadPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const translate = useServerFn(translateDocument);
  const inputRef = useRef<HTMLInputElement>(null);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState<TargetLanguageCode | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please choose a PDF file.");
      return;
    }
    setReading(true);
    setPdf(null);
    try {
      const { text, pageCount } = await extractPdfText(file);
      if (text.replace(/\s/g, "").length < 40) {
        toast.error(
          "No readable text found. This PDF looks like scanned images, so text cannot be extracted.",
        );
        return;
      }
      setPdf({ file, text, pageCount });
      toast.success(`Read ${pageCount} page${pageCount === 1 ? "" : "s"} from ${file.name}`);
    } catch (error) {
      console.error("PDF read failed", error);
      toast.error("This PDF could not be opened. Try another file.");
    } finally {
      setReading(false);
    }
  }

  async function handleTranslate(code: TargetLanguageCode) {
    if (!pdf) return;
    if (!user) {
      toast.error("Please sign in first.");
      await router.navigate({ to: "/auth" });
      return;
    }
    setWorking(code);
    try {
      const result = await translate({
        data: {
          fileName: pdf.file.name,
          pageCount: pdf.pageCount,
          text: pdf.text,
          targetLanguage: code,
        },
      });
      await router.navigate({ to: "/document/$id", params: { id: result.documentId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Translation failed.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <AppShell>
      <section className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" /> Translate · Break into steps · Animate in 3D
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
          Any PDF, understood in <span className="text-gradient">your language</span>, step by step
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
          Upload a document in any language. BharatGuide-AI rewrites it as simple numbered steps in
          Hindi, Tamil, Telugu or Bengali — and can generate a 3D animated video for each step.
        </p>
      </section>

      <section className="mt-10">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFile(event.dataTransfer.files?.[0]);
          }}
          className={`panel flex flex-col items-center justify-center gap-4 px-6 py-14 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : ""
          }`}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            {reading ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <Upload className="size-6" />
            )}
          </span>
          <div>
            <p className="font-display text-lg font-medium">
              {reading ? "Reading your PDF…" : "Drop a PDF here"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Any language · text-based PDFs · up to 60,000 characters are translated
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={reading}>
            Choose file
          </Button>

          {pdf ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm">
              <FileText className="size-4 text-primary" />
              <span className="font-medium">{pdf.file.name}</span>
              <span className="text-muted-foreground">· {pdf.pageCount} pages</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Choose a language to translate into steps
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TARGET_LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              disabled={!pdf || working !== null || authLoading}
              onClick={() => void handleTranslate(language.code)}
              className="panel group flex flex-col items-start gap-2 p-5 text-left transition-all hover:border-primary/60 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span
                className={`text-2xl font-semibold text-foreground ${language.fontClass}`}
              >
                {language.nativeName}
              </span>
              <span className="text-sm text-muted-foreground">{language.englishName}</span>
              <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                {working === language.code ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Translating…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-3.5" /> Translate into steps
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
        {!pdf ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Upload a PDF to enable the language buttons.
          </p>
        ) : null}
        {!authLoading && !user ? (
          <p className="mt-4 text-center text-sm">
            <Link to="/auth" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>{" "}
            to save translations and generate videos.
          </p>
        ) : null}
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {[
          {
            icon: FileText,
            title: "Reads any script",
            body: "Text is extracted from the PDF itself, so English, Arabic, Chinese or Indic source documents all work.",
          },
          {
            icon: Wand2,
            title: "Rewritten as steps",
            body: "Instead of a wall of translated text you get short, ordered instructions anyone can follow.",
          },
          {
            icon: Film,
            title: "3D animated per step",
            body: "Each step gets its own stylized 3D scene — a character actually performing that action.",
          },
        ].map((feature) => (
          <div key={feature.title} className="panel p-6">
            <feature.icon className="size-5 text-primary" />
            <h3 className="mt-3 text-base font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
