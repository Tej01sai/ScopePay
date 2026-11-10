import { MockModeBanner, WorkspaceHeader } from "@/components/app-chrome";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded bg-white px-3 py-2 focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10"
      >
        Skip to content
      </a>
      <MockModeBanner />
      <WorkspaceHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
