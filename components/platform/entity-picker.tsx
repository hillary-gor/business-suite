'use client';

/**
 * Switches the entity being worked in.
 *
 * The list here is only the entities the server said this user has a role in,
 * and the server validates the choice again when the cookie is set. Editing
 * this list in the browser does not grant access to another organisation.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchEntityAction } from '@/server/actions/auth';

export function EntityPicker({
  entities,
  current,
  label = 'Entity',
  hideLabel = false,
  className,
}: {
  entities: ReadonlyArray<{ entityId: string; code: string; name: string }>;
  current: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const rootClass = ['inline', 'entity-picker', className].filter(Boolean).join(' ');

  if (entities.length <= 1) {
    const only = entities[0];
    return (
      <div className={rootClass}>
        <strong style={{ fontSize: '0.88rem' }}>{only?.name ?? 'No entity'}</strong>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <label
        htmlFor="entity"
        className={hideLabel ? 'sr-only' : 'text-small'}
        style={hideLabel ? undefined : { color: 'var(--ink-subtle)' }}
      >
        {label}
      </label>
      <select
        id="entity"
        className="entity-picker__select"
        value={current}
        disabled={pending}
        onChange={(event) => {
          const entityId = event.target.value;
          startTransition(async () => {
            await switchEntityAction(entityId);
            router.refresh();
          });
        }}
      >
        {entities.map((entity) => (
          <option key={entity.entityId} value={entity.entityId}>
            {entity.code} — {entity.name}
          </option>
        ))}
      </select>
    </div>
  );
}
