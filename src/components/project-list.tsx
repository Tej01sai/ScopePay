'use client';

import Link from 'next/link';
import type { Project } from '@/shared/contracts';
import { Button, Card } from './ui';
import { formatCents, formatDateTime } from './utils/money';

export function ProjectList({ projects, onCreate }: { projects: Project[]; onCreate: () => void }) {
  if (projects.length === 0) {
    return (
      <Card className="text-center">
        <h2 className="font-semibold">No projects yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-700">
          Create a project with the scope you agreed with your client. You can use the synthetic
          demo fixture to try the full flow.
        </p>
        <Button className="mt-4" onClick={onCreate}>
          Create your first project
        </Button>
      </Card>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {projects.map((p) => (
        <li key={p.id}>
          <Link
            href={`/projects/${encodeURIComponent(p.id)}`}
            className="block h-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <h2 className="font-semibold text-slate-900">{p.title}</h2>
            <p className="mt-1 text-sm text-slate-700">Client: {p.clientName}</p>
            <p className="mt-2 line-clamp-2 text-sm text-slate-600">{p.scopeText}</p>
            <p className="mt-3 text-xs text-slate-600">
              {formatCents(p.hourlyRateCents)}/hour · created {formatDateTime(p.createdAt)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
