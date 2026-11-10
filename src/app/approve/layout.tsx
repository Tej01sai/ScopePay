import type { Metadata } from "next";
import {
  DemoLabel,
  MockModeBanner,
  SandboxLabel,
} from "@/components/app-chrome";

// The client token lives in the URL fragment; never leak the page URL onward.
export const metadata: Metadata = {
  title: "Review change request · ScopePay (demo)",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ApproveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <MockModeBanner />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="flex items-center gap-2 text-lg font-bold">
            ScopePay <DemoLabel />
          </span>
          <SandboxLabel />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
