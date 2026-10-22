import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { Field } from '@/components/FormField'
import { InlineAlert } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ApiError } from '@/lib/api'
import { AuthLayout } from './AuthLayout'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
})
type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null)
    try {
      await api.auth.forgotPassword(email)
      setSentTo(email)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    }
  })

  return (
    <AuthLayout>
      <div className="space-y-8">
        {sentTo ? (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <MailCheck className="size-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we’ve sent a
                link to reset the password. It expires soon and can be used once.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Forgot your password?</h2>
              <p className="text-sm text-muted-foreground">
                Enter your account email and we’ll send you a link to choose a new one.
              </p>
            </div>
            <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5">
              {error && <InlineAlert kind="error">{error}</InlineAlert>}
              <Field label="Email" error={errors.email?.message}>
                {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" autoFocus {...register('email')} />}
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
                Send reset link
              </Button>
            </form>
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:underline">
              <ArrowLeft className="size-4" /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  )
}
