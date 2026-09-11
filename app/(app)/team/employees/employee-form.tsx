'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveEmployeeAction } from '@/server/actions/team';
import type { Employee } from '@/server/modules/team/employees';
import type { EmployeeStatus } from '@/server/modules/team/schemas';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

type ManagerOption = { id: string; displayName: string };

const STATUS_OPTIONS: Array<{ value: EmployeeStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'TERMINATED', label: 'No longer employed' },
];

export function EmployeeForm({
  employee,
  managers,
  baseCurrency,
}: {
  employee?: Employee;
  managers: readonly ManagerOption[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const [legalName, setLegalName] = useState(employee?.legalName ?? '');
  const [preferredFirstName, setPreferredFirstName] = useState(employee?.preferredFirstName ?? '');
  const [displayName, setDisplayName] = useState(employee?.displayName ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [homeAddress, setHomeAddress] = useState(employee?.homeAddress ?? '');
  const [birthDate, setBirthDate] = useState(employee?.birthDate ?? '');
  const [gender, setGender] = useState(employee?.gender ?? '');
  const [governmentId, setGovernmentId] = useState(employee?.governmentId ?? '');
  const [status, setStatus] = useState<EmployeeStatus>(employee?.status ?? 'ACTIVE');
  const [hireDate, setHireDate] = useState(employee?.hireDate ?? '');
  const [releaseDate, setReleaseDate] = useState(employee?.releaseDate ?? '');
  const [managerId, setManagerId] = useState(employee?.managerId ?? '');
  const [department, setDepartment] = useState(employee?.department ?? '');
  const [jobTitle, setJobTitle] = useState(employee?.jobTitle ?? '');
  const [employeeNo, setEmployeeNo] = useState(employee?.employeeNo ?? '');
  const [billingRate, setBillingRate] = useState(employee?.billingRate ?? '');
  const [contactName, setContactName] = useState(employee?.emergencyContactName ?? '');
  const [contactRelationship, setContactRelationship] = useState(
    employee?.emergencyContactRelationship ?? '',
  );
  const [contactPhone, setContactPhone] = useState(employee?.emergencyContactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(employee?.emergencyContactEmail ?? '');
  const [notes, setNotes] = useState(employee?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setFields({});
    startTransition(async () => {
      const result = await saveEmployeeAction({
        employeeId: employee?.id,
        legalName,
        preferredFirstName,
        displayName,
        email,
        phone,
        homeAddress,
        birthDate,
        gender,
        governmentId,
        status,
        hireDate,
        releaseDate,
        managerId,
        department,
        jobTitle,
        employeeNo,
        billingRate,
        emergencyContactName: contactName,
        emergencyContactRelationship: contactRelationship,
        emergencyContactPhone: contactPhone,
        emergencyContactEmail: contactEmail,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        setFields(result.fields ?? {});
        return;
      }
      router.push(`/team/employees/${result.data.employeeId}`);
      router.refresh();
    });
  }

  return (
    <div className="stack emp-form">
      {error ? <Alert title="Could not save this employee">{error}</Alert> : null}

      <section className="emp-card" id="personal">
        <header className="emp-card__head">
          <h2>Personal info</h2>
        </header>
        <div className="form-grid">
          <Field label="Legal name" htmlFor="legalName" required error={fields.legalName}>
            <input
              id="legalName"
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
            />
          </Field>
          <Field label="Preferred first name" htmlFor="preferredFirstName">
            <input
              id="preferredFirstName"
              value={preferredFirstName}
              onChange={(event) => setPreferredFirstName(event.target.value)}
            />
          </Field>
          <Field
            label="Display name"
            htmlFor="displayName"
            hint="Leave blank to build one from the names above"
          >
            <input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="email" error={fields.email}>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Phone number" htmlFor="phone">
            <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="Birth date" htmlFor="birthDate" error={fields.birthDate}>
            <input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
            />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <select
              id="gender"
              value={gender}
              onChange={(event) => setGender(event.target.value as typeof gender)}
            >
              <option value="">Not stated</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
            </select>
          </Field>
          <Field label="Government ID" htmlFor="governmentId" hint="National ID or KRA PIN">
            <input
              id="governmentId"
              value={governmentId}
              onChange={(event) => setGovernmentId(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Home address" htmlFor="homeAddress">
          <textarea
            id="homeAddress"
            rows={2}
            value={homeAddress}
            onChange={(event) => setHomeAddress(event.target.value)}
          />
        </Field>
      </section>

      <section className="emp-card" id="employment">
        <header className="emp-card__head">
          <h2>Employment details</h2>
        </header>
        <div className="form-grid">
          <Field label="Status" htmlFor="status">
            <select
              id="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as EmployeeStatus)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hire date" htmlFor="hireDate" error={fields.hireDate}>
            <input
              id="hireDate"
              type="date"
              value={hireDate}
              onChange={(event) => setHireDate(event.target.value)}
            />
          </Field>
          <Field
            label="Release date"
            htmlFor="releaseDate"
            hint="The last day of employment"
            error={fields.releaseDate}
          >
            <input
              id="releaseDate"
              type="date"
              value={releaseDate}
              onChange={(event) => setReleaseDate(event.target.value)}
            />
          </Field>
          <Field label="Manager" htmlFor="managerId">
            <select
              id="managerId"
              value={managerId}
              onChange={(event) => setManagerId(event.target.value)}
            >
              <option value="">None</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department" htmlFor="department">
            <input
              id="department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            />
          </Field>
          <Field label="Job title" htmlFor="jobTitle">
            <input
              id="jobTitle"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
            />
          </Field>
          <Field label="Employee ID" htmlFor="employeeNo" hint="Leave blank to generate one">
            <input
              id="employeeNo"
              value={employeeNo}
              onChange={(event) => setEmployeeNo(event.target.value)}
            />
          </Field>
          <Field
            label={`Billing rate (${baseCurrency} per hour)`}
            htmlFor="billingRate"
            error={fields.billingRate}
          >
            <input
              id="billingRate"
              inputMode="decimal"
              value={billingRate}
              onChange={(event) => setBillingRate(event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="emp-card" id="emergency">
        <header className="emp-card__head">
          <h2>Emergency contact</h2>
        </header>
        <p className="emp-card__hint">
          Employee&rsquo;s contact in case of emergency. This could be their spouse, partner or
          friend.
        </p>
        <div className="form-grid">
          <Field label="Name" htmlFor="contactName">
            <input
              id="contactName"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
            />
          </Field>
          <Field label="Relationship" htmlFor="contactRelationship">
            <input
              id="contactRelationship"
              value={contactRelationship}
              onChange={(event) => setContactRelationship(event.target.value)}
            />
          </Field>
          <Field label="Phone number" htmlFor="contactPhone">
            <input
              id="contactPhone"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="contactEmail" error={fields.emergencyContactEmail}>
            <input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="emp-card" id="notes">
        <header className="emp-card__head">
          <h2>Notes</h2>
        </header>
        <Field label="Notes" htmlFor="notes">
          <textarea
            id="notes"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </section>

      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={pending}
          onClick={() => router.push(employee ? `/team/employees/${employee.id}` : '/team/employees')}
        >
          Cancel
        </button>
        <button type="button" className="button button--primary" disabled={pending} onClick={submit}>
          <BusyLabel pending={pending} idle="Save employee" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
