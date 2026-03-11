/**
 * Shared validation schemas for Edge Functions.
 */
import { z } from 'https://esm.sh/zod@3.23.8'
const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(256)
  .refine((p) => /[a-zA-Z]/.test(p), 'Password must contain at least one letter')
  .refine((p) => /\d/.test(p), 'Password must contain at least one number')
const emailSchema = z.string().email().max(255)
const uuidSchema = z.string().uuid()

export const resetPasswordSchema = z.object({
  user_id: uuidSchema.optional(),
  email: emailSchema.optional(),
  new_password: passwordSchema,
}).refine((d) => d.user_id || d.email, {
  message: 'Must provide either user_id or email',
  path: ['user_id'],
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
