import { z } from 'zod';

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED'] as const;
export const EMPLOYEE_GENDERS = ['FEMALE', 'MALE', 'PREFER_NOT_TO_SAY'] as const;

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.')
  .optional()
  .or(z.literal(''));

export const saveEmployeeInput = z.object({
  employeeId: z.string().uuid().optional(),
  employeeNo: optional(40),
  displayName: optional(200),
  legalName: z.string().trim().min(2, 'A legal name is required.').max(200),
  preferredFirstName: optional(80),
  email: z.string().trim().email('That email address is not valid.').max(200).optional().or(z.literal('')),
  phone: optional(40),
  homeAddress: optional(400),
  birthDate: optionalDate,
  gender: z.enum(EMPLOYEE_GENDERS).optional().or(z.literal('')),
  governmentId: optional(60),
  status: z.enum(EMPLOYEE_STATUSES).default('ACTIVE'),
  hireDate: optionalDate,
  releaseDate: optionalDate,
  managerId: z.string().uuid().optional().or(z.literal('')),
  department: optional(120),
  jobTitle: optional(120),
  billingRate: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,4})?$/, 'Enter an amount such as 2500 or 2500.00.')
    .optional()
    .or(z.literal('')),
  emergencyContactName: optional(200),
  emergencyContactRelationship: optional(80),
  emergencyContactPhone: optional(40),
  emergencyContactEmail: z.string().trim().email('That email address is not valid.').max(200).optional().or(z.literal('')),
  notes: optional(4000),
});

export const setEmployeeStatusInput = z.object({
  employeeId: z.string().uuid(),
  status: z.enum(EMPLOYEE_STATUSES),
});

export type SaveEmployeeInput = z.infer<typeof saveEmployeeInput>;
export type SetEmployeeStatusInput = z.infer<typeof setEmployeeStatusInput>;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export type EmployeeGender = (typeof EMPLOYEE_GENDERS)[number];
