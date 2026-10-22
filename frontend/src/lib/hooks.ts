import { useEffect, useState } from 'react'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from './api'

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

const CODE_TO_FIELD: Record<string, string> = {
  EMAIL_TAKEN: 'email',
  EMPLOYEE_CODE_TAKEN: 'employee_code',
}

/**
 * Pushes server-side validation messages onto the matching form fields.
 * Returns a message for anything that could not be attached to a field.
 */
export function applyApiErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, fields: string[]): string | null {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.'
  const byCode = CODE_TO_FIELD[err.code]
  if (byCode && fields.includes(byCode)) {
    setError(byCode as Path<T>, { message: err.message })
    return null
  }
  let attached = false
  for (const fe of err.fieldErrors) {
    if (fields.includes(fe.field)) {
      setError(fe.field as Path<T>, { message: fe.message })
      attached = true
    }
  }
  return attached ? null : err.message
}
