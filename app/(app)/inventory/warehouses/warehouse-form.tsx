'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveWarehouseAction } from '@/server/actions/inventory';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export function WarehouseForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isConsignment, setIsConsignment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveWarehouseAction({
        name,
        code: code || undefined,
        isConsignment,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/inventory/warehouses');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save warehouse">{error}</Alert> : null}
      <div className="form-grid">
        <Field label="Name" htmlFor="name" required>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Code" htmlFor="code" hint="Leave blank to generate one">
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Consignment" htmlFor="consignment" hint="Held but not owned — excluded from GL valuation">
          <label className="checkbox-row">
            <input
              id="consignment"
              type="checkbox"
              checked={isConsignment}
              onChange={(e) => setIsConsignment(e.target.checked)}
            />
            Consignment warehouse
          </label>
        </Field>
      </div>
      <div className="button-row">
        <button type="button" className="button button--primary" disabled={pending} onClick={submit}>
          <BusyLabel pending={pending} idle="Save warehouse" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
