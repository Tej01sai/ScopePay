"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isMockMode } from "@/lib/api-client";
import { Button } from "./ui";

export function MockModeBanner() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  if (!isMockMode) return null;

  async function reset() {
    const { resetMockData } = await import("@/mocks/server");
    resetMockData();
    setConfirming(false);
    router.push("/login");
  }

  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-950"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>
          <strong>Mock mode.</strong> Data is simulated in this browser. No AI
          model or PayPal calls are made.
        </p>
        {confirming ? (
          <span className="flex items-center gap-2">
            <span>Delete all mock data?</span>
            <Button variant="danger" className="min-h-8 py-1" onClick={reset}>
              Reset
            </Button>
            <Button
              variant="ghost"
              className="min-h-8 py-1"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            className="min-h-8 py-1"
            onClick={() => setConfirming(true)}
          >
            Reset mock data
          </Button>
        )}
      </div>
    </div>
  );
}

export function DemoLabel() {
  return (
    <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
      Demo
    </span>
  );
}

export function SandboxLabel() {
  return (
    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-900 ring-1 ring-sky-300">
      {isMockMode ? "Simulated payments" : "PayPal sandbox"}
    </span>
  );
}

export function WorkspaceHeader() {
  return (
    <header className="border-b border-blue-100 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/projects"
          className="flex items-center gap-2 rounded text-lg font-bold text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <span
            className="flex size-9 items-center justify-center rounded-xl bg-[#003087] text-sm text-white"
            aria-hidden="true"
          >
            S
          </span>{" "}
          ScopePay <DemoLabel />
        </Link>
        <nav aria-label="Workspace" className="flex items-center gap-3 text-sm">
          <SandboxLabel />
          <Link
            href="/projects"
            className="rounded px-2 py-1 font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Projects
          </Link>
        </nav>
      </div>
    </header>
  );
}
