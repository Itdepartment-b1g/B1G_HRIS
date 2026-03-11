/**
 * Shared validation schemas for Edge Functions.
 */
import { z } from 'https://esm.sh/zod@3.23.8'
const uuidSchema = z.string().uuid()
export const deleteUserSchema = z.object({ user_id: uuidSchema })

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
