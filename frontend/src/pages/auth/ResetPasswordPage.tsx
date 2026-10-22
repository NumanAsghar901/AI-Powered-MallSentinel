import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, LinkIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { Field, PasswordInput } from '@/components/FormField'
import { InlineAlert } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { passwordSchema } from '@/lib/schemas'
import { AuthLayout } from './AuthLayout'

const schema = z
  .object({ password: passwordSchema, confirm: z.string().min(1, 'Confirm your new password') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type FormValues = z.infer<typeof schema>

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } })

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return
    setError(null)
    try {
      await api.auth.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, expired: err.code === 'RESET_TOKEN_EXPIRED' || err.code === 'RESET_TOKEN_INVALID' })
      } else {
        setError({ message: 'Something went wrong. Please try again.', expired: false })
      }
    }
  })

  if (!token || done || error?.expired) {
    const state = done ? 'done' : 'bad'
    return (
      <AuthLayout>
        <div className="space-y-5 text-center">
          <div
            className={`mx-auto flex size-14 items-center justify-center rounded-full ${
              state === 'done' ? 'bg-success-soft text-success' : 'bg-danger-soft text-destructive'
            }`}
          >
            {state === 'done' ? <CheckCircle2 className="size-7" /> : <LinkIcon className="size-7" />}
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">{state === 'done' ? 'Password updated' : 'Link not valid'}</h2>
            <p className="text-sm text-muted-foreground">
              {state === 'done'
                ? 'Your password has been reset. You can now sign in with the new password.'
                : (error?.message ?? 'This reset link is missing, invalid or has expired.')}
            </p>
          </div>
          <Button asChild className="w-full" size="lg">
            <Link to={state === 'done' ? '/login' : '/forgot-password'}>
              {state === 'done' ? 'Go to sign in' : 'Request a new link'}
            </Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Choose a new password</h2>
          <p className="text-sm text-muted-foreground">At least 8 characters, with a letter and a number.</p>
        </div>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5">
          {error && <InlineAlert kind="error">{error.message}</InlineAlert>}
          <Field label="New password" error={errors.password?.message}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" autoFocus {...register('password')} />}
          </Field>
          <Field label="Confirm new password" error={errors.confirm?.message}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" {...register('confirm')} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Reset password
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}
