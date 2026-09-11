import {
  withReadOnlyTransaction,
  withTransaction,
  type RequestContext,
} from '@/server/db/transaction';
import type {
  EmployeeGender,
  EmployeeStatus,
  SaveEmployeeInput,
  SetEmployeeStatusInput,
} from './schemas';

export interface EmployeeRow {
  id: string;
  employeeNo: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: EmployeeStatus;
  jobTitle: string | null;
  department: string | null;
}

export interface Employee extends EmployeeRow {
  legalName: string;
  preferredFirstName: string | null;
  homeAddress: string | null;
  birthDate: string | null;
  gender: EmployeeGender | null;
  governmentId: string | null;
  hireDate: string | null;
  releaseDate: string | null;
  managerId: string | null;
  managerName: string | null;
  billingRate: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  emergencyContactEmail: string | null;
  notes: string | null;
}

type EmployeeQueryRow = {
  id: string;
  employee_no: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  status: EmployeeStatus;
  job_title: string | null;
  department: string | null;
};

type EmployeeDetailRow = EmployeeQueryRow & {
  legal_name: string;
  preferred_first_name: string | null;
  home_address: string | null;
  birth_date: string | null;
  gender: EmployeeGender | null;
  government_id: string | null;
  hire_date: string | null;
  release_date: string | null;
  manager_id: string | null;
  manager_name: string | null;
  billing_rate: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_email: string | null;
  notes: string | null;
};

function toRow(row: EmployeeQueryRow): EmployeeRow {
  return {
    id: row.id,
    employeeNo: row.employee_no,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    jobTitle: row.job_title,
    department: row.department,
  };
}

export async function listEmployees(context: RequestContext): Promise<EmployeeRow[]> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<EmployeeQueryRow>(
      `select e.id, e.employee_no, e.display_name, e.email, e.phone,
              e.status, e.job_title, e.department
         from app.employees e
        where e.entity_id = $1
        order by e.display_name`,
      [context.entityId],
    ),
  );
  return rows.map(toRow);
}

export async function getEmployee(
  context: RequestContext,
  employeeId: string,
): Promise<Employee | null> {
  const row = await withReadOnlyTransaction(context, (tx) =>
    tx.maybeOne<EmployeeDetailRow>(
      `select e.id, e.employee_no, e.display_name, e.email, e.phone,
              e.status, e.job_title, e.department,
              e.legal_name, e.preferred_first_name, e.home_address,
              to_char(e.birth_date, 'YYYY-MM-DD')   as birth_date,
              e.gender, e.government_id,
              to_char(e.hire_date, 'YYYY-MM-DD')    as hire_date,
              to_char(e.release_date, 'YYYY-MM-DD') as release_date,
              e.manager_id, m.display_name as manager_name,
              e.billing_rate::text as billing_rate,
              e.emergency_contact_name, e.emergency_contact_relationship,
              e.emergency_contact_phone, e.emergency_contact_email,
              e.notes
         from app.employees e
         left join app.employees m on m.id = e.manager_id
        where e.entity_id = $1 and e.id = $2`,
      [context.entityId, employeeId],
    ),
  );

  if (!row) return null;

  return {
    ...toRow(row),
    legalName: row.legal_name,
    preferredFirstName: row.preferred_first_name,
    homeAddress: row.home_address,
    birthDate: row.birth_date,
    gender: row.gender,
    governmentId: row.government_id,
    hireDate: row.hire_date,
    releaseDate: row.release_date,
    managerId: row.manager_id,
    managerName: row.manager_name,
    billingRate: row.billing_rate,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactRelationship: row.emergency_contact_relationship,
    emergencyContactPhone: row.emergency_contact_phone,
    emergencyContactEmail: row.emergency_contact_email,
    notes: row.notes,
  };
}

export async function saveEmployee(context: RequestContext, input: SaveEmployeeInput) {
  return withTransaction(context, async (tx) => {
    const employeeId = await tx.scalar<string>(`select app.save_employee($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        employee_id: input.employeeId ?? null,
        employee_no: input.employeeNo || null,
        display_name: input.displayName || null,
        legal_name: input.legalName,
        preferred_first_name: input.preferredFirstName || null,
        email: input.email || null,
        phone: input.phone || null,
        home_address: input.homeAddress || null,
        birth_date: input.birthDate || null,
        gender: input.gender || null,
        government_id: input.governmentId || null,
        status: input.status,
        hire_date: input.hireDate || null,
        release_date: input.releaseDate || null,
        manager_id: input.managerId || null,
        department: input.department || null,
        job_title: input.jobTitle || null,
        billing_rate: input.billingRate || null,
        emergency_contact_name: input.emergencyContactName || null,
        emergency_contact_relationship: input.emergencyContactRelationship || null,
        emergency_contact_phone: input.emergencyContactPhone || null,
        emergency_contact_email: input.emergencyContactEmail || null,
        notes: input.notes || null,
      }),
    ]);
    return { employeeId };
  });
}

export async function setEmployeeStatus(context: RequestContext, input: SetEmployeeStatusInput) {
  return withTransaction(context, async (tx) => {
    const employeeId = await tx.scalar<string>(
      `select app.set_employee_status($1, $2::uuid, $3)`,
      [context.entityId, input.employeeId, input.status],
    );
    return { employeeId };
  });
}
