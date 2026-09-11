'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveItemCategoryAction } from '@/server/actions/inventory';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export function CategoryForm({
  parents,
}: {
  parents: ReadonlyArray<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentId, setParentId] = useState('');
  const [ataChapter, setAtaChapter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveItemCategoryAction({
        name,
        code: code || undefined,
        parentId: parentId || undefined,
        ataChapter: ataChapter || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/inventory/categories');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save category">{error}</Alert> : null}
      <div className="form-grid">
        <Field label="Name" htmlFor="name" required>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Code" htmlFor="code" hint="Leave blank to generate one">
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Parent category" htmlFor="parent">
          <select id="parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ATA chapter" htmlFor="ata" hint="Optional aviation grouping">
          <input id="ata" value={ataChapter} onChange={(e) => setAtaChapter(e.target.value)} />
        </Field>
      </div>
      <div className="button-row">
        <button type="button" className="button button--primary" disabled={pending} onClick={submit}>
          <BusyLabel pending={pending} idle="Save category" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
