import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Field, PasswordInput } from '@/components/FormField'
import { roleLabel } from '@/components/Badges'
import { FullPageSpinner, InlineAlert } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ROLE_HOME } from '@/lib/types'
import { AuthLayout } from './AuthLayout'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
type FormValues = z.infer<typeof schema>

interface LoginError {
  kind: 'error' | 'info'
  message: string
}

function describe(err: unknown): LoginError {
  if (err instanceof ApiError) {
    // Messages mirror SSD UC-01: invalid credentials / locked / disabled.
    if (err.code === 'ACCOUNT_LOCKED') return { kind: 'info', message: err.message }
    return { kind: 'error', message: err.message }
  }
  return { kind: 'error', message: 'Something went wrong. Please try again.' }
}

export function LoginPage() {
  const { login, logout, user, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<LoginError | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const user = await login(values.email, values.password)
      const home = ROLE_HOME[user.role]
      const from = (location.state as { from?: string } | null)?.from
      navigate(from?.startsWith(home) ? from : home)
    } catch (err) {
      setFormError(describe(err))
    }
  })

  if (status === 'loading') return <FullPageSpinner label="Checking your session…" />

  // Already signed in (for example after pressing Back from the dashboard): stay on this page, let them choose.
  if (user) {
    return (
      <AuthLayout>
        <div className="space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">You’re already signed in</h2>
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.full_name}</span> ({roleLabel(user.role)}) in
              this tab.
            </p>
          </div>
          <div className="space-y-3">
            <Button asChild size="lg" className="w-full">
              <Link to={ROLE_HOME[user.role]}>Go to my dashboard</Link>
            </Button>
            <Button variant="outline" size="lg" className="w-full" onClick={() => void logout()}>
              Sign in as someone else
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="text-sm text-muted-foreground">Use the email and password given to you by your administrator.</p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5">
          {formError && <InlineAlert kind={formError.kind}>{formError.message}</InlineAlert>}

          <Field label="Email" error={errors.email?.message}>
            {(p) => <Input {...p} type="email" autoComplete="username" inputMode="email" autoFocus {...register('email')} />}
          </Field>

          <Field label="Password" error={errors.password?.message}>
            {(p) => <PasswordInput {...p} autoComplete="current-password" {...register('password')} />}
          </Field>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm font-medium text-brand-teal hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          {/* Placeholder: Google OAuth is not implemented yet. */}
          <Button type="button" variant="outline" size="lg" className="w-full" disabled>
            Continue with Google — coming soon
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Accounts are created by your administrator. There is no public sign-up.
        </p>
      </div>
    </AuthLayout>
  )
}
