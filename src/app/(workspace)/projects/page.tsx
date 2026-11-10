"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Project } from "@/shared/contracts";
import { CreateProjectForm } from "@/components/create-project-form";
import { ProjectList } from "@/components/project-list";
import { Button, ErrorNotice } from "@/components/ui";
import { useAuthRedirect, useSubmit } from "@/components/utils/hooks";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useSubmit(
    useCallback(async () => {
      setProjects(await api.listProjects());
    }, []),
  );
  useAuthRedirect(load.error);
  const { run: loadProjects } = load;

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-700">
            Your freelance workspace
          </p>
          <h1 className="text-3xl font-bold">A clear scope. A fair payment.</h1>
          <p className="text-sm text-slate-700">
            Keep your agreements, client decisions, and PayPal sandbox payments
            in one place.
          </p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>New project</Button>
        )}
      </div>

      {creating && (
        <CreateProjectForm
          onCancel={() => setCreating(false)}
          onCreated={(project) => {
            setProjects((list) => [project, ...(list ?? [])]);
            setCreating(false);
          }}
        />
      )}

      {load.error && load.error.status !== 401 ? (
        <ErrorNotice
          error={load.error}
          onRetry={() => void loadProjects()}
          retryPending={load.pending}
        />
      ) : projects === null ? (
        <p className="text-sm text-slate-600" role="status">
          Loading projects…
        </p>
      ) : (
        <ProjectList projects={projects} onCreate={() => setCreating(true)} />
      )}
    </div>
  );
}
