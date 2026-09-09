import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { deleteDocument, listDocuments } from "@/lib/documents.functions";
import { getLanguage } from "@/lib/languages";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library — Anuvaad Studio" },
      {
        name: "description",
        content:
          "All your translated PDFs, their step lists and generated 3D animated videos in one place.",
      },
      { property: "og:title", content: "Library — Anuvaad Studio" },
      {
        property: "og:description",
        content: "Revisit translated documents and the 3D videos generated for each step.",
      },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const fetchDocuments = useServerFn(listDocuments);
  const removeDocument = useServerFn(deleteDocument);
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => fetchDocuments(),
    enabled: Boolean(user),
  });

  if (authLoading) {
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
          <h1 className="text-xl font-semibold">Sign in to see your library</h1>
          <Button asChild className="mt-5">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const documents = documentsQuery.data ?? [];

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Translated documents, their steps and generated 3D videos.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">
            <Upload className="size-4" /> New upload
          </Link>
        </Button>
      </div>

      {documentsQuery.isLoading ? (
        <Loader2 className="mx-auto mt-12 size-6 animate-spin text-primary" />
      ) : documents.length === 0 ? (
        <div className="panel mt-8 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Upload a PDF to create your first set of translated steps.
          </p>
          <Button asChild className="mt-5">
            <Link to="/">Upload a PDF</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {documents.map((document) => {
            const language = getLanguage(document.target_language);
            return (
              <div key={document.id} className="panel flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link to="/document/$id" params={{ id: document.id }} className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <FileText className="size-4 shrink-0 text-primary" />
                      {document.file_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {document.page_count} pages
                      {document.source_language ? ` · from ${document.source_language}` : ""} ·{" "}
                      {new Date(document.created_at).toLocaleDateString()}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete document"
                    onClick={async () => {
                      try {
                        await removeDocument({ data: { id: document.id } });
                        await queryClient.invalidateQueries({ queryKey: ["documents"] });
                        toast.success("Document deleted");
                      } catch {
                        toast.error("Could not delete this document.");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {document.summary ? (
                  <p className={`text-sm text-muted-foreground ${language?.fontClass ?? ""}`}>
                    {document.summary}
                  </p>
                ) : null}

                <span className="mt-auto w-fit rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <span className={language?.fontClass}>{language?.nativeName}</span> ·{" "}
                  {language?.englishName}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
