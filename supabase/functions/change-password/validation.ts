/// <reference path="../edge-types.d.ts" />
import { z } from 'https://esm.sh/zod@3.23.8'

const passwordSchema = z.string()
  .min(6, 'Password must be at least 6 characters')
  .max(256)

const selfieSchema = z.string()
  .min(80, 'Selfie is required')
  .max(2_000_000, 'Selfie is too large. Please retake the photo.')
  .refine(
    (s) => /^data:image\/(jpeg|jpg|png);base64,/i.test(s),
    'Selfie must be a JPEG or PNG image'
  )

export const changePasswordSchema = z.object({
  new_password: passwordSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  selfie: selfieSchema,
  user_agent: z.string().max(512).optional(),
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
