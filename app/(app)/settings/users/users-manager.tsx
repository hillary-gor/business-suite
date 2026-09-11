'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  inviteUserAction,
  resendAccessEmailAction,
  setUserActiveAction,
  setUserRoleAction,
} from '@/server/actions/settings';
import { Alert, Badge, DataTable, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

type RoleOption = { code: string; name: string; description: string };

type Person = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roleCodes: string[];
  roleNames: string[];
};

export function UsersManager({
  currentUserId,
  people,
  roles,
}: {
  currentUserId: string;
  people: Person[];
  roles: RoleOption[];
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState(roles[0]?.code ?? 'sales');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [rowPending, setRowPending] = useState<string | null>(null);

  function invite() {
    setError(null);
    setSaved(null);
    setActionLink(null);
    setCopied(false);
    startTransition(async () => {
      const result = await inviteUserAction({ fullName, email, roleCode });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(result.message ?? 'Saved.');
      setActionLink(result.data.actionLink);
      if (result.data.emailed) {
        setFullName('');
        setEmail('');
      }
      router.refresh();
    });
  }

  function saveRole(userId: string, nextRole: string) {
    setError(null);
    setSaved(null);
    setRowPending(userId);
    startTransition(async () => {
      const result = await setUserRoleAction({ userId, roleCode: nextRole });
      setRowPending(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(result.message ?? 'Role saved.');
      router.refresh();
    });
  }

  function setActive(userId: string, isActive: boolean) {
    if (!isActive && !window.confirm('Revoke this person’s access to the company?')) return;
    setError(null);
    setSaved(null);
    setRowPending(userId);
    startTransition(async () => {
      const result = await setUserActiveAction({ userId, isActive });
      setRowPending(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(result.message ?? 'Saved.');
      router.refresh();
    });
  }

  function sendEmail(userId: string) {
    setError(null);
    setSaved(null);
    setActionLink(null);
    setRowPending(userId);
    startTransition(async () => {
      const result = await resendAccessEmailAction({ userId });
      setRowPending(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(result.message ?? 'Email sent.');
      setActionLink(result.data.actionLink);
      router.refresh();
    });
  }

  async function copyLink() {
    if (!actionLink) return;
    await navigator.clipboard.writeText(actionLink);
    setCopied(true);
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not update users">{error}</Alert> : null}
      {saved ? (
        <Alert tone="success" title="Saved">
          {saved}
        </Alert>
      ) : null}

      <section className="stack">
        <h2 className="card-title">Invite a person</h2>
        <p className="cell-muted">
          They are emailed a link to set a password and sign in. The message comes from
          invite@skyjetaircraftspares.com. Signing in with a password only works after they have
          saved one from that link. If they cannot sign in, use Email access to send a fresh link.
        </p>
        <div className="form-grid">
          <Field label="Full name" htmlFor="invite-name" required>
            <input
              id="invite-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              disabled={pending}
            />
          </Field>
          <Field label="Email" htmlFor="invite-email" required>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={pending}
            />
          </Field>
          <Field label="Role" htmlFor="invite-role" required>
            <select
              id="invite-role"
              value={roleCode}
              onChange={(event) => setRoleCode(event.target.value)}
              disabled={pending}
            >
              {roles.map((role) => (
                <option key={role.code} value={role.code} title={role.description}>
                  {role.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="button-row">
          <button type="button" className="button button--primary" onClick={invite} disabled={pending}>
            <BusyLabel pending={pending} idle="Send invite" tone="inverse" />
          </button>
        </div>
        {actionLink ? (
          <Field
            label="Invite link"
            htmlFor="invite-link"
            hint="The email did not send. Copy this once as a fallback."
          >
            <div className="button-row">
              <input id="invite-link" readOnly value={actionLink} />
              <button type="button" className="button" onClick={() => void copyLink()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </Field>
        ) : null}
      </section>

      <section className="stack">
        <h2 className="card-title">People in this company</h2>
        {people.length === 0 ? (
          <p className="cell-muted">No one has a role in this company yet.</p>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const currentRole = person.roleCodes[0] ?? '';
                const isSelf = person.id === currentUserId;
                const busy = pending && rowPending === person.id;
                return (
                  <tr key={person.id}>
                    <td>
                      {person.fullName}
                      {isSelf ? <span className="cell-muted"> (you)</span> : null}
                    </td>
                    <td>{person.email}</td>
                    <td>
                      <select
                        aria-label={`Role for ${person.fullName}`}
                        value={currentRole}
                        disabled={busy}
                        onChange={(event) => saveRole(person.id, event.target.value)}
                      >
                        {roles.map((role) => (
                          <option key={role.code} value={role.code}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Badge tone={person.isActive ? 'success' : 'neutral'}>
                        {person.isActive ? 'Active' : 'Revoked'}
                      </Badge>
                    </td>
                    <td>
                      {isSelf ? (
                        <span className="cell-muted">—</span>
                      ) : (
                        <div className="button-row">
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            disabled={busy || !person.isActive}
                            onClick={() => sendEmail(person.id)}
                          >
                            Email access
                          </button>
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            disabled={busy}
                            onClick={() => setActive(person.id, !person.isActive)}
                          >
                            {person.isActive ? 'Revoke' : 'Restore'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
