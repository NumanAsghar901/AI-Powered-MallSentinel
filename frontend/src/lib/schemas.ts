import { z } from 'zod'

/** Mirrors the backend rule: 8–128 chars with at least one letter and one number. */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number')

export const phoneSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^[0-9+\-\s()]{7,30}$/.test(v), 'Enter a valid phone number')

export const nameSchema = z.string().trim().min(2, 'Enter the full name').max(150, 'Name is too long')
export const emailSchema = z.string().trim().min(1, 'Enter an email address').email('Enter a valid email address')

export const SHIFTS = ['morning', 'evening', 'night'] as const
