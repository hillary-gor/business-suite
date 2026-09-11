import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { getEmployee } from '@/server/modules/team/employees';
import { Amount } from '@/components/ui';
import { formatDisplayDate } from '@/lib/payables';
import { employeeGenderLabel, employeeInitial, employeeStatusLabel } from '@/lib/team';
import { EmployeeActions } from './employee-actions';

export const metadata = { title: 'Employee · SkyJet' };

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { employeeId } = await params;
  const { context, session, entity } = await authorise(Permission.TeamEmployeeRead);
  const employee = await getEmployee(context, employeeId);
  if (!employee) notFound();

  const mayManage = can(session, entity.entityId, Permission.TeamEmployeeManage);
  const tab = (await searchParams).tab === 'notes' ? 'notes' : 'profile';
  const editHref = (section: string) => `/team/employees/${employee.id}/edit#${section}`;
  const hasEmergencyContact = Boolean(
    employee.emergencyContactName ||
      employee.emergencyContactPhone ||
      employee.emergencyContactEmail,
  );

  return (
    <div className="emp-detail">
      <Link href="/team/employees" className="emp-detail__back">
        <span aria-hidden="true">‹</span> Employee list
      </Link>

      <header className="emp-detail__head">
        <span className="emp-avatar emp-avatar--lg" aria-hidden="true">
          {employeeInitial(employee.displayName)}
        </span>
        <div className="emp-detail__identity">
          <h1>{employee.displayName}</h1>
          <p className="emp-detail__status">{employeeStatusLabel(employee.status)}</p>
        </div>
        {mayManage ? (
          <EmployeeActions employeeId={employee.id} status={employee.status} />
        ) : null}
      </header>

      <nav className="emp-tabs" aria-label="Employee sections">
        <Link
          href={`/team/employees/${employee.id}`}
          className={tab === 'profile' ? 'emp-tabs__tab is-current' : 'emp-tabs__tab'}
        >
          Profile
        </Link>
        <Link
          href={`/team/employees/${employee.id}?tab=notes`}
          className={tab === 'notes' ? 'emp-tabs__tab is-current' : 'emp-tabs__tab'}
        >
          Notes
        </Link>
      </nav>

      {tab === 'notes' ? (
        <section className="emp-card">
          <header className="emp-card__head">
            <h2>Notes</h2>
            {mayManage ? <Link href={editHref('notes')}>Edit</Link> : null}
          </header>
          {employee.notes ? (
            <p className="emp-card__notes">{employee.notes}</p>
          ) : (
            <p className="emp-card__hint">
              Anything worth remembering about this employee that is not a field above.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="emp-card">
            <header className="emp-card__head">
              <h2>Personal info</h2>
              {mayManage ? <Link href={editHref('personal')}>Edit</Link> : null}
            </header>
            <dl className="emp-facts">
              <Fact label="Legal name" value={employee.legalName} />
              <Fact label="Preferred first name" value={employee.preferredFirstName} />
              <Fact
                label="Email"
                value={
                  employee.email ? <a href={`mailto:${employee.email}`}>{employee.email}</a> : null
                }
              />
              <Fact label="Phone number" value={employee.phone} />
              <Fact label="Home address" value={employee.homeAddress} />
              <Fact
                label="Birth date"
                value={employee.birthDate ? formatDisplayDate(employee.birthDate) : null}
              />
              <Fact label="Gender" value={employeeGenderLabel(employee.gender)} />
              <Fact label="Government ID" value={employee.governmentId} />
            </dl>
          </section>

          <section className="emp-card">
            <header className="emp-card__head">
              <h2>Employment details</h2>
              {mayManage ? <Link href={editHref('employment')}>Edit</Link> : null}
            </header>
            <dl className="emp-facts">
              <Fact label="Status" value={employeeStatusLabel(employee.status)} />
              <Fact
                label="Hire date"
                value={employee.hireDate ? formatDisplayDate(employee.hireDate) : null}
              />
              <Fact
                label="Manager"
                value={
                  employee.managerId && employee.managerName ? (
                    <Link href={`/team/employees/${employee.managerId}`}>
                      {employee.managerName}
                    </Link>
                  ) : null
                }
              />
              <Fact label="Department" value={employee.department} />
              <Fact label="Job title" value={employee.jobTitle} />
              <Fact label="Employee ID" value={employee.employeeNo} />
              <Fact
                label="Billing rate"
                value={
                  employee.billingRate ? (
                    <Amount value={employee.billingRate} currency={entity.baseCurrency} showCurrency />
                  ) : null
                }
              />
              {employee.releaseDate ? (
                <Fact label="Release date" value={formatDisplayDate(employee.releaseDate)} />
              ) : null}
            </dl>
          </section>

          <section className="emp-card">
            <header className="emp-card__head">
              <h2>Emergency contact</h2>
              {mayManage ? (
                <Link href={editHref('emergency')}>{hasEmergencyContact ? 'Edit' : 'Start'}</Link>
              ) : null}
            </header>
            {hasEmergencyContact ? (
              <dl className="emp-facts">
                <Fact label="Name" value={employee.emergencyContactName} />
                <Fact label="Relationship" value={employee.emergencyContactRelationship} />
                <Fact label="Phone number" value={employee.emergencyContactPhone} />
                <Fact label="Email" value={employee.emergencyContactEmail} />
              </dl>
            ) : (
              <p className="emp-card__hint">
                Employee&rsquo;s contact in case of emergency. This could be their spouse, partner
                or friend.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="emp-fact">
      <dt>{label}</dt>
      <dd>
        {value === null || value === undefined || value === '' ? (
          <span className="emp-fact__none">-</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
