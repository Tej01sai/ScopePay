'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api-client';

/**
 * Runs an async action at most once at a time. A ref guards against double
 * clicks that land before React re-renders the disabled button.
 */
export function useSubmit<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        return await action(...args);
      } catch (err) {
        setError(toApiError(err));
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error, clearError: () => setError(null) };
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(0, {
    code: 'UNEXPECTED',
    message: err instanceof Error ? err.message : 'Something went wrong.',
  });
}

/** Sends the freelancer to sign-in when a workspace request returns 401. */
export function useAuthRedirect(error: ApiError | null) {
  const router = useRouter();
  useEffect(() => {
    if (error?.status === 401) {
      const next = window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [error, router]);
}

/**
 * Text state that survives a reload of this tab (sessionStorage), so pasted
 * scope and conversation text is not lost after a failure or refresh.
 */
export function useDraft(key: string, initial = '') {
  const storageKey = `scopepay.draft.${key}`;
  const [value, setValue] = useState(initial);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore after hydration
      if (saved !== null) setValue(saved);
    } catch {
      // Storage unavailable; state still works for this render.
    }
  }, [storageKey]);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      try {
        if (next) window.sessionStorage.setItem(storageKey, next);
        else window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore.
      }
    },
    [storageKey],
  );

  return [value, update] as const;
}

export type PollState = {
  checks: number;
  lastCheckedAt: Date | null;
  exhausted: boolean;
  checking: boolean;
};

/**
 * Bounded polling: calls `check` every `intervalMs` while `active`, at most
 * `maxChecks` times, then stops and leaves a manual refresh to the user.
 * Calling `refresh` checks immediately and restarts the budget.
 */
export function useBoundedPolling(
  check: () => Promise<void>,
  active: boolean,
  { intervalMs = 5_000, maxChecks = 12 } = {},
) {
  const [state, setState] = useState<PollState>({
    checks: 0,
    lastCheckedAt: null,
    exhausted: false,
    checking: false,
  });
  const [epoch, setEpoch] = useState(0);
  const checkRef = useRef(check);
  useEffect(() => {
    checkRef.current = check;
  });
  const running = useRef(false);

  const runCheck = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState((s) => ({ ...s, checking: true }));
    try {
      await checkRef.current();
    } finally {
      running.current = false;
      setState((s) => ({ ...s, checking: false, checks: s.checks + 1, lastCheckedAt: new Date() }));
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      if (count > maxChecks) {
        window.clearInterval(timer);
        setState((s) => ({ ...s, exhausted: true }));
        return;
      }
      void runCheck();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, maxChecks, runCheck, epoch]);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, exhausted: false, checks: 0 }));
    setEpoch((e) => e + 1);
    await runCheck();
  }, [runCheck]);

  return { ...state, refresh };
}
