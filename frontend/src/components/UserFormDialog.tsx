import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field, PasswordInput } from '@/components/FormField'
import { InlineAlert } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import { applyApiErrors } from '@/lib/hooks'
import { emailSchema, nameSchema, passwordSchema, phoneSchema, SHIFTS } from '@/lib/schemas'
import type { Shift, User } from '@/lib/types'

/** `admin` creates supervisors/employees in any department; `supervisor` only employees in their own. */
type Variant = 'admin' | 'supervisor'

const NONE = '__none__'

const baseShape = {
  full_name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  role: z.enum(['supervisor', 'employee']),
  department_id: z.string(),
  designation: z.string().trim().max(100, 'Too long'),
  shift: z.string(),
  assigned_area: z.string().trim().max(150, 'Too long'),
  employee_code: z.string().trim().max(30, 'Too long'),
}

function buildSchema(isEdit: boolean, variant: Variant) {
  return z
    .object({
      ...baseShape,
      password: isEdit ? z.union([z.literal(''), passwordSchema]) : passwordSchema,
    })
    .superRefine((v, ctx) => {
      if (variant === 'admin' && !v.department_id) {
        ctx.addIssue({ code: 'custom', path: ['department_id'], message: 'Select a department' })
      }
    })
}
type FormValues = z.infer<ReturnType<typeof buildSchema>>

const FIELDS = ['full_name', 'email', 'phone', 'role', 'department_id', 'designation', 'shift', 'assigned_area', 'employee_code', 'password']

function toValues(user: User | null, variant: Variant): FormValues {
  return {
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    role: user?.role === 'supervisor' ? 'supervisor' : 'employee',
    department_id: user?.department ? String(user.department.id) : '',
    designation: user?.designation ?? '',
    shift: user?.shift ?? '',
    assigned_area: user?.assigned_area ?? '',
    employee_code: user?.employee_code ?? '',
    password: '',
    ...(variant === 'supervisor' ? { role: 'employee' as const } : {}),
  }
}

export function UserFormDialog({
  open,
  onOpenChange,
  variant,
  user,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  variant: Variant
  /** null → create */
  user: User | null
  onSaved: (message: string) => void
}) {
  const isEdit = user !== null
  const schema = useMemo(() => buildSchema(isEdit, variant), [isEdit, variant])
  const [formError, setFormError] = useState<string | null>(null)

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: api.departments.list,
    enabled: open && variant === 'admin',
    staleTime: Infinity,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(user, variant) })

  useEffect(() => {
    if (open) {
      reset(toValues(user, variant))
      setFormError(null)
    }
  }, [open, user, variant, reset])

  const role = watch('role')
  const showEmployeeFields = role === 'employee'

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    const text = (s: string) => (s.trim() === '' ? null : s.trim())
    const profile = {
      designation: text(v.designation),
      ...(showEmployeeFields
        ? { shift: (text(v.shift) as Shift | null), assigned_area: text(v.assigned_area), employee_code: text(v.employee_code) }
        : {}),
    }
    try {
      if (variant === 'admin') {
        if (isEdit) {
          await api.users.update(user.id, {
            full_name: v.full_name,
            email: v.email,
            phone: text(v.phone),
            role: v.role,
            department_id: Number(v.department_id),
            ...profile,
            ...(v.password ? { password: v.password } : {}),
          })
        } else {
          await api.users.create({
            full_name: v.full_name,
            email: v.email,
            phone: text(v.phone),
            role: v.role,
            department_id: Number(v.department_id),
            password: v.password,
            ...profile,
          })
        }
      } else if (isEdit) {
        await api.employees.update(user.id, {
          full_name: v.full_name,
          email: v.email,
          phone: text(v.phone),
          ...profile,
          ...(v.password ? { password: v.password } : {}),
        })
      } else {
        await api.employees.create({
          full_name: v.full_name,
          email: v.email,
          phone: text(v.phone),
          password: v.password,
          ...profile,
        })
      }
      onSaved(isEdit ? 'Changes saved.' : `${v.full_name} was added.`)
      onOpenChange(false)
    } catch (err) {
      setFormError(applyApiErrors(err, setError, FIELDS))
    }
  })

  const noun = variant === 'supervisor' ? 'employee' : 'user'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the details below. Leave the password blank to keep it unchanged.'
              : variant === 'supervisor'
                ? 'The employee is added to your department. Share the password with them securely.'
                : 'Create a supervisor or employee account. Share the password with them securely.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
          {formError && <InlineAlert kind="error">{formError}</InlineAlert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.full_name?.message}>
              {(p) => <Input {...p} autoComplete="off" {...register('full_name')} />}
            </Field>
            <Field label="Email" error={errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="off" inputMode="email" {...register('email')} />}
            </Field>
            <Field label="Phone (optional)" error={errors.phone?.message}>
              {(p) => <Input {...p} type="tel" autoComplete="off" inputMode="tel" {...register('phone')} />}
            </Field>
            <Field label={isEdit ? 'New password (optional)' : 'Password'} error={errors.password?.message}>
              {(p) => <PasswordInput {...p} autoComplete="new-password" {...register('password')} />}
            </Field>

            {variant === 'admin' && (
              <>
                <Field label="Role" error={errors.role?.message}>
                  {(p) => (
                    <Controller
                      control={control}
                      name="role"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger {...p}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="supervisor">Supervisor</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </Field>
                <Field label="Department" error={errors.department_id?.message}>
                  {(p) => (
                    <Controller
                      control={control}
                      name="department_id"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange} disabled={departments.isLoading}>
                          <SelectTrigger {...p}>
                            <SelectValue placeholder={departments.isLoading ? 'Loading…' : 'Select department'} />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.data?.map((d) => (
                              <SelectItem key={d.id} value={String(d.id)}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </Field>
              </>
            )}

            <Field label="Designation (optional)" error={errors.designation?.message}>
              {(p) => <Input {...p} autoComplete="off" {...register('designation')} />}
            </Field>

            {showEmployeeFields && (
              <>
                <Field label="Employee code (optional)" error={errors.employee_code?.message}>
                  {(p) => <Input {...p} autoComplete="off" {...register('employee_code')} />}
                </Field>
                <Field label="Shift (optional)" error={errors.shift?.message}>
                  {(p) => (
                    <Controller
                      control={control}
                      name="shift"
                      render={({ field }) => (
                        <Select
                          value={field.value === '' ? NONE : field.value}
                          onValueChange={(val) => field.onChange(val === NONE ? '' : val)}
                        >
                          <SelectTrigger {...p}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Not set</SelectItem>
                            {SHIFTS.map((s) => (
                              <SelectItem key={s} value={s} className="capitalize">
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </Field>
                <Field label="Assigned area (optional)" error={errors.assigned_area?.message}>
                  {(p) => <Input {...p} autoComplete="off" {...register('assigned_area')} />}
                </Field>
              </>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? 'Save changes' : `Add ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
