import { Link, useRouter } from "@tanstack/react-router";
import { Languages, LogOut, Library, Upload } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen grid-backdrop">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Languages className="size-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-base font-semibold">BharatGuide-AI</span>
              <span className="text-[11px] text-muted-foreground">
                PDF → regional steps → 3D video
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-1.5">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <Upload className="size-4" />
                <span className="hidden sm:inline">Upload</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/library">
                <Library className="size-4" />
                <span className="hidden sm:inline">Library</span>
              </Link>
            </Button>
            {user ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut();
                  await router.navigate({ to: "/auth" });
                }}
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-10">{children}</main>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        BharatGuide-AI · translation and 3D scene generation powered by Lovable AI
      </footer>
    </div>
  );
}
