import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { StepCard, type StepRow } from "@/components/StepCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getDocument } from "@/lib/documents.functions";
import { getDocumentVideoUrls } from "@/lib/video.functions";
import { getLanguage } from "@/lib/languages";

export const Route = createFileRoute("/document/$id")({
  head: () => ({
    meta: [
      { title: "Translated steps — BharatGuide-AI" },
      {
        name: "description",
        content:
          "Your document rewritten as numbered steps in your chosen Indian language, each with a 3D animated video.",
      },
      { property: "og:title", content: "Translated steps — BharatGuide-AI" },
      {
        property: "og:description",
        content: "Numbered translated steps with per-step 3D animated explainer videos.",
      },
    ],
  }),
  component: DocumentPage,
});

function DocumentPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const fetchDocument = useServerFn(getDocument);
  const fetchVideoUrls = useServerFn(getDocumentVideoUrls);

  const documentQuery = useQuery({
    queryKey: ["document", id],
    queryFn: () => fetchDocument({ data: { id } }),
    enabled: Boolean(user),
  });

  const videosQuery = useQuery({
    queryKey: ["document-videos", id],
    queryFn: () => fetchVideoUrls({ data: { documentId: id } }),
    enabled: Boolean(user),
  });

  if (authLoading || (user && documentQuery.isLoading)) {
    return (
      <AppShell>
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="panel mx-auto max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Sign in to view this document</h1>
          <Button asChild className="mt-5">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  if (documentQuery.error || !documentQuery.data) {
    return (
      <AppShell>
        <div className="panel mx-auto max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Document not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been deleted, or it belongs to another account.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/library">Back to library</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const { document, steps } = documentQuery.data;
  const language = getLanguage(document.target_language);

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
        <Link to="/library">
          <ArrowLeft className="size-4" /> Library
        </Link>
      </Button>

      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="size-3.5" />
              {document.file_name} · {document.page_count} pages
              {document.source_language ? ` · from ${document.source_language}` : ""}
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              {steps.length} steps in{" "}
              <span className={language?.fontClass}>{language?.nativeName}</span>
            </h1>
            {document.summary ? (
              <p
                className={`mt-2 max-w-2xl text-sm text-muted-foreground ${language?.fontClass ?? ""}`}
              >
                {document.summary}
              </p>
            ) : null}
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {language?.englishName}
          </span>
        </div>
      </header>

      <div className="mt-6 space-y-4">
        {(steps as StepRow[]).map((step) => (
          <StepCard
            key={step.id}
            step={step}
            language={language}
            initialUrl={videosQuery.data?.[step.id]}
          />
        ))}
      </div>
    </AppShell>
  );
}
