'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, isMockMode } from '@/lib/api-client';
import { Button, Card, ErrorNotice, InputField } from '@/components/ui';
import { useSubmit } from '@/components/utils/hooks';

/** Only same-origin relative paths are allowed as a post-login destination. */
function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/projects';
}

export default function LoginPage() {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const submit = useSubmit(async (accessSecret: string) => {
    await api.createDemoSession(accessSecret);
    router.replace(safeNext());
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit.run(secret);
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="text-xl font-bold">Sign in to the demo workspace</h1>
        <p className="mt-1 text-sm text-slate-700">
          ScopePay is a hackathon demo with one shared freelancer workspace. Enter the demo access
          secret you were given.
        </p>
        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
          <InputField
            label="Demo access secret"
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            error={submit.error?.fieldErrors.accessSecret}
            hint={isMockMode ? 'Mock mode accepts any non-empty value.' : undefined}
            required
          />
          <ErrorNotice error={submit.error} />
          <Button type="submit" pending={submit.pending} pendingLabel="Signing in…">
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
