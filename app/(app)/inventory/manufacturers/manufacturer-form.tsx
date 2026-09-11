'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveManufacturerAction } from '@/server/actions/inventory';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export function ManufacturerForm({
  onSaved,
  submitLabel = 'Save manufacturer',
}: {
  onSaved?: (result: { manufacturerId: string; name: string }) => void;
  submitLabel?: string;
}) {
  const router = useRouter();
  const formId = useId();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [cageCode, setCageCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveManufacturerAction({
        name,
        code: code || undefined,
        cageCode: cageCode || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (onSaved) {
        onSaved({ manufacturerId: result.data.manufacturerId, name });
        return;
      }
      router.push('/inventory/manufacturers');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save manufacturer">{error}</Alert> : null}
      <div className="form-grid">
        <Field label="Name" htmlFor={`${formId}-name`} required>
          <input
            id={`${formId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Code" htmlFor={`${formId}-code`} hint="Leave blank to generate one">
          <input
            id={`${formId}-code`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <Field label="CAGE code" htmlFor={`${formId}-cage`}>
          <input
            id={`${formId}-cage`}
            value={cageCode}
            onChange={(event) => setCageCode(event.target.value)}
          />
        </Field>
      </div>
      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel pending={pending} idle={submitLabel} tone="inverse" />
        </button>
      </div>
    </div>
  );
}
