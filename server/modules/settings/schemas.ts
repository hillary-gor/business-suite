import { z } from 'zod';

export const provisionUserInput = z.object({
  email: z.string().trim().email().max(200),
  fullName: z.string().trim().min(2).max(120),
  roleCode: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, 'Choose a role from the list.'),
});

export const setUserRoleInput = z.object({
  userId: z.string().uuid(),
  roleCode: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, 'Choose a role from the list.'),
});

export const setUserActiveInput = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export const resendAccessEmailInput = z.object({
  userId: z.string().uuid(),
});

export const requestPasswordResetInput = z.object({
  email: z.string().trim().email().max(200),
});

export const setPasswordInput = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters.').max(200),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'The two passwords do not match.',
    path: ['confirm'],
  });

export type ProvisionUserInput = z.infer<typeof provisionUserInput>;
export type SetUserRoleInput = z.infer<typeof setUserRoleInput>;
export type SetUserActiveInput = z.infer<typeof setUserActiveInput>;
export type ResendAccessEmailInput = z.infer<typeof resendAccessEmailInput>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInput>;

export const saveEntityInput = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradingName: z.string().trim().max(200).optional().or(z.literal('')),
  taxPin: z.string().trim().max(40).optional().or(z.literal('')),
  registrationNumber: z.string().trim().max(80).optional().or(z.literal('')),
  countryCode: z.string().trim().length(2).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  addressLine1: z.string().trim().max(200).optional().or(z.literal('')),
  addressLine2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
});

export type SaveEntityInput = z.infer<typeof saveEntityInput>;

export const saveSalesSurveySettingsInput = z.object({
  askWorkRequest: z.boolean(),
  askReview: z.boolean(),
  askReferral: z.boolean(),
  frequencyDays: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]),
});

export type SaveSalesSurveySettingsInput = z.infer<typeof saveSalesSurveySettingsInput>;

export const sendFeedbackInput = z.object({
  scope: z.enum(['this_page', 'something_else']).default('this_page'),
  topic: z.enum(['bug', 'missing_feature', 'other']),
  message: z
    .string()
    .trim()
    .min(12, 'Write a little more so we can act on it.')
    .max(8000, 'Keep the message under 8,000 characters.'),
  page: z
    .string()
    .trim()
    .max(200)
    .regex(/^$|^\/[A-Za-z0-9/_-]*$/, 'That page path is not valid.')
    .optional()
    .or(z.literal('')),
  pageTitle: z.string().trim().max(80).optional().or(z.literal('')),
});

export type SendFeedbackInput = z.infer<typeof sendFeedbackInput>;
