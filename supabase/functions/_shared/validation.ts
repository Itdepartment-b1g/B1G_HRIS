/**
 * Shared validation schemas for Edge Functions.
 * Use zod to validate request bodies and reject invalid payloads with 400.
 */

import { z } from 'https://esm.sh/zod@3.23.8'

const ROLE_ENUM = z.enum([
  'employee', 'intern', 'supervisor', 'manager', 'executive', 'admin', 'super_admin'
])

/** Password policy: min 12 chars, at least one letter and one number */
const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(256)
  .refine((p) => /[a-zA-Z]/.test(p), 'Password must contain at least one letter')
  .refine((p) => /\d/.test(p), 'Password must contain at least one number')

const emailSchema = z.string().email().max(255)
const phoneSchema = z.string().max(50).optional().nullable()
const uuidSchema = z.string().uuid()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()

/** create-user request body */
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema.optional(),
  employee_code: z.string().min(1).max(50).trim(),
  first_name: z.string().min(1).max(100).trim(),
  last_name: z.string().min(1).max(100).trim(),
  phone: phoneSchema,
  department: z.string().max(100).optional().nullable(),
  position: z.string().max(100).optional().nullable(),
  role: ROLE_ENUM.optional(),
  roles: z.array(ROLE_ENUM).optional(),
  hired_date: dateSchema,
})

/** update-user-profile request body */
export const updateUserProfileSchema = z.object({
  user_id: uuidSchema.optional(),
  email: emailSchema.optional(),
  employee_code: z.string().min(1).max(50).trim().optional(),
  first_name: z.string().min(1).max(100).trim().optional(),
  last_name: z.string().min(1).max(100).trim().optional(),
  phone: phoneSchema,
  department: z.string().max(100).optional().nullable(),
  position: z.string().max(100).optional().nullable(),
  supervisor_id: uuidSchema.optional().nullable(),
  is_active: z.boolean().optional(),
  hired_date: dateSchema,
  avatar_url: z.string().max(500).optional().nullable(),
  role: ROLE_ENUM.optional(),
  roles: z.array(ROLE_ENUM).optional(),
}).refine((d) => d.user_id || d.email, {
  message: 'Must provide either user_id or email',
  path: ['user_id'],
})

/** reset-password request body */
export const resetPasswordSchema = z.object({
  user_id: uuidSchema.optional(),
  email: emailSchema.optional(),
  new_password: passwordSchema,
}).refine((d) => d.user_id || d.email, {
  message: 'Must provide either user_id or email',
  path: ['user_id'],
})

/** delete-user request body */
export const deleteUserSchema = z.object({
  user_id: uuidSchema,
})

export function validateOr400<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const msg = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).filter(Boolean).join('; ') || result.error.message
    throw new ValidationError(msg || 'Validation failed')
  }
  return result.data
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type DeleteUserInput = z.infer<typeof deleteUserSchema>
