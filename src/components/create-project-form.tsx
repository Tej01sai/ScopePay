'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api-client';
import type { Project } from '@/shared/contracts';
import { demoProject } from '@/mocks/fixtures';
import { Button, Card, ErrorNotice, InputField, TextAreaField } from './ui';
import { useAuthRedirect, useDraft, useSubmit } from './utils/hooks';
import { parseDollarsToCents } from './utils/money';

export function CreateProjectForm({
  onCreated,
  onCancel,
}: {
  onCreated: (project: Project) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useDraft('newProject.title');
  const [clientName, setClientName] = useDraft('newProject.client');
  const [scopeText, setScopeText] = useDraft('newProject.scope');
  const [rate, setRate] = useDraft('newProject.rate');
  const [rateError, setRateError] = useState<string>();

  const submit = useSubmit(async () => {
    const project = await api.createProject({
      title: title.trim(),
      clientName: clientName.trim(),
      scopeText: scopeText.trim(),
      hourlyRateCents: parseDollarsToCents(rate)!,
      currency: 'USD',
    });
    for (const clear of [setTitle, setClientName, setScopeText, setRate]) clear('');
    onCreated(project);
  });
  useAuthRedirect(submit.error);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(rate);
    if (cents === null || cents <= 0) {
      setRateError('Enter an hourly rate in US dollars, like 50 or 62.50.');
      return;
    }
    setRateError(undefined);
    void submit.run();
  }

  function fillFixture() {
    setTitle(demoProject.title);
    setClientName(demoProject.clientName);
    setScopeText(demoProject.scopeText);
    setRate(demoProject.hourlyRateDollars);
  }

  const fe = submit.error?.fieldErrors ?? {};

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">New project</h2>
        <Button variant="ghost" onClick={fillFixture}>
          Use synthetic demo fixture
        </Button>
      </div>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
        <InputField
          label="Project title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={fe.title}
          required
        />
        <InputField
          label="Client display name"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          error={fe.clientName}
          required
        />
        <div className="sm:col-span-2">
          <TextAreaField
            label="Agreed scope"
            hint="Paste the scope exactly as agreed. Findings will quote it."
            value={scopeText}
            onChange={(e) => setScopeText(e.target.value)}
            error={fe.scopeText}
            rows={5}
            required
          />
        </div>
        <InputField
          label="Hourly rate (USD)"
          inputMode="decimal"
          placeholder="50.00"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          error={rateError ?? fe.hourlyRateCents}
          required
        />
        <div className="flex items-end justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" pending={submit.pending} pendingLabel="Creating…">
            Create project
          </Button>
        </div>
        <div className="sm:col-span-2">
          <ErrorNotice error={submit.error?.status === 401 ? null : submit.error} />
        </div>
      </form>
    </Card>
  );
}
