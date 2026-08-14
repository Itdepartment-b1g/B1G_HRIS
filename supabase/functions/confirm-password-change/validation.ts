/// <reference path="../edge-types.d.ts" />
import { z } from 'https://esm.sh/zod@3.23.8'

export const confirmPasswordChangeSchema = z.object({
  token: z.string().min(32).max(128),
})

type ZodSchema<T> = {
  safeParse: (data: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { message: string; errors: { path: PropertyKey[]; message: string }[] } }
}

export function validateOr400<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (result.success === false) {
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
