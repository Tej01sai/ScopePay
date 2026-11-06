'use client';

// Stand-in for PayPal's hosted invoice page, available only in mock mode.
// It changes the simulated PayPal-side status; the app learns about it only
// when it next asks the (mock) backend, just as it would with real PayPal.
import { useEffect, useState } from 'react';
import { isMockMode } from '@/lib/api-client';
import type { Invoice } from '@/shared/contracts';
import { Button, Card, Notice } from '@/components/ui';
import { formatCents } from '@/components/utils/money';

export default function MockPayPalPage() {
  const [invoice, setInvoice] = useState<Invoice | null | undefined>(undefined);
  const [done, setDone] = useState<'PAID' | 'CANCELLED' | null>(null);

  useEffect(() => {
    if (!isMockMode) return;
    const id = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('invoice') ?? '';
    void import('@/mocks/server').then(({ getMockInvoice }) => setInvoice(getMockInvoice(id)));
  }, []);

  if (!isMockMode) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Not available</h1>
        <p className="mt-2 text-sm text-slate-700">This page exists only in mock mode.</p>
      </Card>
    );
  }
  if (invoice === undefined) return null;
  if (!invoice) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Mock invoice not found</h1>
      </Card>
    );
  }

  async function settle(status: 'PAID' | 'CANCELLED') {
    const { setMockProviderStatus } = await import('@/mocks/server');
    setMockProviderStatus(invoice!.id, status);
    setDone(status);
  }

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Simulated PayPal page</p>
      <h1 className="mt-1 text-xl font-bold">Invoice {invoice.providerInvoiceId}</h1>
      <p className="mt-2 text-3xl font-bold">{formatCents(invoice.totalCents)}</p>
      {done ? (
        <div className="mt-4">
          <Notice tone={done === 'PAID' ? 'success' : 'info'}>
            {done === 'PAID' ? 'Simulated payment sent.' : 'Simulated invoice cancelled.'} Close this
            tab and return to ScopePay. It shows the new status after its next check with the
            server.
          </Notice>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void settle('PAID')}>Pay {formatCents(invoice.totalCents)}</Button>
          <Button variant="secondary" onClick={() => void settle('CANCELLED')}>
            Cancel invoice (merchant)
          </Button>
        </div>
      )}
    </Card>
  );
}
