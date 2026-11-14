import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Plus, RotateCcw, Settings2, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field, PasswordInput } from '@/components/FormField'
import { InlineAlert } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDepartmentWorkstations } from '@/components/dash/sections'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { applyApiErrors } from '@/lib/hooks'
import { emailSchema, nameSchema, passwordSchema, phoneSchema, SHIFTS } from '@/lib/schemas'
import type { Shift, User } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * `admin`: an admin creates or edits a **supervisor** (any section).
 * `supervisor`: a supervisor creates or edits an **employee** in their own section.
 */
type Variant = 'admin' | 'supervisor'

const NONE = '__none__'

const baseShape = {
  full_name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  department_id: z.string(),
  designation: z.string().trim().max(100, 'Too long'),
  shift: z.string(),
  assigned_area: z.string().trim().max(150, 'Too long'),
  employee_code: z.string().trim().max(30, 'Too long'),
}

function buildSchema(isEdit: boolean, _variant: Variant) {
  return z
    .object({
      ...baseShape,
      password: isEdit ? z.union([z.literal(''), passwordSchema]) : passwordSchema,
    })
    .superRefine((v, ctx) => {
      if (!v.department_id) {
        ctx.addIssue({ code: 'custom', path: ['department_id'], message: 'Select a department section' })
      }
    })
}
type FormValues = z.infer<ReturnType<typeof buildSchema>>

const FIELDS = ['full_name', 'email', 'phone', 'department_id', 'designation', 'shift', 'assigned_area', 'employee_code', 'password']

function toValues(user: User | null, defaultDeptId?: number): FormValues {
  return {
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    department_id: user?.department ? String(user.department.id) : (defaultDeptId ? String(defaultDeptId) : ''),
    designation: user?.designation ?? '',
    shift: user?.shift ?? '',
    assigned_area: user?.assigned_area ?? '',
    employee_code: user?.employee_code ?? '',
    password: '',
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
  /** null creates a new account. */
  user: User | null
  onSaved: (message: string) => void
}) {
  const isEdit = user !== null
  const noun = variant === 'admin' ? 'supervisor' : 'employee'
  const { user: currentUser } = useAuth()
  const defaultDeptId = user?.department?.id ?? currentUser?.department?.id
  const schema = useMemo(() => buildSchema(isEdit, variant), [isEdit, variant])
  const [formError, setFormError] = useState<string | null>(null)

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: api.departments.list,
    enabled: open,
    staleTime: Infinity,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(user, defaultDeptId) })

  const watchedDeptId = watch('department_id')
  const watchedAssignedArea = watch('assigned_area')

  const selectedDept = departments.data?.find((d) => String(d.id) === watchedDeptId) || currentUser?.department
  const deptCode = selectedDept?.code

  const { stations, allWorkstations, addStation, removeStation, resetStations } =
    useDepartmentWorkstations(deptCode)

  const [isManaging, setIsManaging] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newStationName, setNewStationName] = useState('')
  const [stationError, setStationError] = useState<string | null>(null)

  const handleAddStation = () => {
    const trimmed = newStationName.trim()
    if (!trimmed) {
      setStationError('Please enter a workstation name')
      return
    }
    if (stations.includes(trimmed)) {
      setStationError('This workstation option already exists')
      return
    }
    addStation(trimmed)
    setValue('assigned_area', trimmed)
    setNewStationName('')
    setStationError(null)
    setIsAdding(false)
  }

  const handleDeleteStation = (stationName: string) => {
    removeStation(stationName)
    if (watchedAssignedArea === stationName) {
      setValue('assigned_area', '')
    }
  }

  useEffect(() => {
    if (open) {
      reset(toValues(user, defaultDeptId))
      setFormError(null)
      setIsManaging(false)
      setIsAdding(false)
      setNewStationName('')
      setStationError(null)
    }
  }, [open, user, defaultDeptId, reset])

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    const text = (s: string) => (s.trim() === '' ? null : s.trim())
    try {
      if (variant === 'admin') {
        const common = {
          full_name: v.full_name,
          email: v.email,
          phone: text(v.phone),
          department_id: Number(v.department_id),
          designation: text(v.designation),
        }
        if (isEdit) await api.supervisors.update(user.id, { ...common, ...(v.password ? { password: v.password } : {}) })
        else await api.supervisors.create({ ...common, password: v.password })
      } else {
        const common = {
          full_name: v.full_name,
          email: v.email,
          phone: text(v.phone),
          department_id: v.department_id ? Number(v.department_id) : undefined,
          designation: text(v.designation),
          shift: text(v.shift) as Shift | null,
          assigned_area: text(v.assigned_area),
          employee_code: text(v.employee_code),
        }
        if (isEdit) await api.employees.update(user.id, { ...common, ...(v.password ? { password: v.password } : {}) })
        else await api.employees.create({ ...common, password: v.password })
      }
      onSaved(isEdit ? 'Changes saved.' : `${v.full_name} was added.`)
      onOpenChange(false)
    } catch (err) {
      setFormError(applyApiErrors(err, setError, FIELDS))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the details below. Leave the password blank to keep it unchanged.'
              : variant === 'supervisor'
                ? 'The employee is added to your section. Use their Gmail address: penalty notices are emailed to it. Share the password with them securely.'
                : 'Create a supervisor for a section. Share the password with them securely.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
          {formError && <InlineAlert kind="error">{formError}</InlineAlert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.full_name?.message}>
              {(p) => <Input {...p} autoComplete="off" {...register('full_name')} />}
            </Field>
            <Field
              label={variant === 'supervisor' ? 'Email (Gmail)' : 'Email'}
              error={errors.email?.message}
              {...(variant === 'supervisor' ? { hint: 'Penalty notices are sent here.' } : {})}
            >
              {(p) => <Input {...p} type="email" autoComplete="off" inputMode="email" {...register('email')} />}
            </Field>
            <Field label="Phone (optional)" error={errors.phone?.message}>
              {(p) => <Input {...p} type="tel" autoComplete="off" inputMode="tel" {...register('phone')} />}
            </Field>
            <Field label={isEdit ? 'New password (optional)' : 'Password'} error={errors.password?.message}>
              {(p) => <PasswordInput {...p} autoComplete="new-password" {...register('password')} />}
            </Field>

            {variant === 'admin' && (
              <Field label="Section" error={errors.department_id?.message}>
                {(p) => (
                  <Controller
                    control={control}
                    name="department_id"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={departments.isLoading}>
                        <SelectTrigger {...p}>
                          <SelectValue placeholder={departments.isLoading ? 'Loading…' : 'Select section'} />
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
            )}

            <Field label="Designation (optional)" error={errors.designation?.message}>
              {(p) => <Input {...p} autoComplete="off" {...register('designation')} />}
            </Field>

            {variant === 'supervisor' && (
              <>
                <Field label="Department section" error={errors.department_id?.message}>
                  {(p) => (
                    <Controller
                      control={control}
                      name="department_id"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(val) => {
                            field.onChange(val)
                            setValue('assigned_area', '')
                          }}
                          disabled={departments.isLoading}
                        >
                          <SelectTrigger {...p}>
                            <SelectValue placeholder={departments.isLoading ? 'Loading…' : 'Select section'} />
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
                <Field
                  label="Workstation / Area to assign"
                  error={errors.assigned_area?.message}
                  hint="The employee sees this in 'Your section'."
                  rightAction={
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAdding((v) => !v)
                          setIsManaging(false)
                          setStationError(null)
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        title="Add a custom workstation"
                      >
                        <Plus className="size-3" /> Add
                      </button>
                      <span className="text-muted-foreground/30">•</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsManaging((v) => !v)
                          setIsAdding(false)
                          setStationError(null)
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-medium transition-colors hover:underline',
                          isManaging ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                        )}
                        title="Manage / delete existing workstations"
                      >
                        <Settings2 className="size-3" /> Manage ({stations.length})
                      </button>
                    </div>
                  }
                >
                  {(p) => (
                    <div className="space-y-2">
                      <Select
                        value={
                          !watchedAssignedArea || watchedAssignedArea === ''
                            ? NONE
                            : watchedAssignedArea
                        }
                        onValueChange={(val) => {
                          if (val === NONE) {
                            setValue('assigned_area', '')
                          } else if (val === '__add_new__') {
                            setIsAdding(true)
                            setIsManaging(false)
                            setStationError(null)
                          } else if (val === '__manage__') {
                            setIsManaging(true)
                            setIsAdding(false)
                            setStationError(null)
                          } else {
                            setValue('assigned_area', val)
                            const matchingDeptCode = Object.entries(allWorkstations).find(([_, list]) =>
                              list.includes(val)
                            )?.[0]
                            if (matchingDeptCode && departments.data) {
                              const targetDept = departments.data.find((d) => d.code === matchingDeptCode)
                              if (targetDept && String(targetDept.id) !== watchedDeptId) {
                                setValue('department_id', String(targetDept.id))
                              }
                            }
                          }
                        }}
                      >
                        <SelectTrigger {...p}>
                          <SelectValue placeholder="Select workstation section" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not assigned</SelectItem>
                          {watchedAssignedArea &&
                            watchedAssignedArea !== '' &&
                            !stations.includes(watchedAssignedArea) && (
                              <SelectItem value={watchedAssignedArea}>
                                {watchedAssignedArea} (custom / current)
                              </SelectItem>
                            )}
                          {stations.map((sec) => (
                            <SelectItem key={sec} value={sec}>
                              {sec}
                            </SelectItem>
                          ))}
                          <SelectItem value="__add_new__" className="text-primary font-medium focus:text-primary">
                            + Add new workstation…
                          </SelectItem>
                          <SelectItem value="__manage__" className="text-muted-foreground text-xs focus:text-foreground">
                            ⚙️ Manage / delete options ({stations.length})…
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {isAdding && (
                        <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 space-y-2 animate-in fade-in slide-in-from-top-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-primary">
                            <span className="flex items-center gap-1.5">
                              <Plus className="size-3.5" /> Add new workstation ({selectedDept?.name || 'Section'})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAdding(false)
                                setNewStationName('')
                                setStationError(null)
                              }}
                              className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                          <div className="flex gap-1.5">
                            <Input
                              autoFocus
                              placeholder="Type workstation name (e.g. Cake Decorating Station)…"
                              value={newStationName}
                              onChange={(e) => {
                                setNewStationName(e.target.value)
                                setStationError(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleAddStation()
                                } else if (e.key === 'Escape') {
                                  setIsAdding(false)
                                }
                              }}
                              className="h-8 text-xs bg-background"
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={handleAddStation}
                            >
                              Save & Assign
                            </Button>
                          </div>
                          {stationError && <p className="text-[11px] text-destructive">{stationError}</p>}
                        </div>
                      )}

                      {isManaging && (
                        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2.5 animate-in fade-in">
                          <div className="flex items-center justify-between border-b border-border/60 pb-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                              <Settings2 className="size-3.5 text-muted-foreground" />
                              <span>Manage Workstations ({selectedDept?.name || 'Section'})</span>
                              <span className="rounded-full bg-background border px-1.5 py-0.2 text-[10px] text-muted-foreground">
                                {stations.length}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setIsManaging(false)}
                            >
                              Done
                            </Button>
                          </div>

                          {stations.length === 0 ? (
                            <div className="py-2 text-center text-xs text-muted-foreground italic">
                              No workstations for this section yet. Add your own below or restore presets.
                            </div>
                          ) : (
                            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                              {stations.map((sec) => (
                                <div
                                  key={sec}
                                  className="flex items-center justify-between rounded border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs transition-colors hover:border-border"
                                >
                                  <span className="font-medium text-foreground truncate">{sec}</span>
                                  <button
                                    type="button"
                                    title={`Delete ${sec}`}
                                    aria-label={`Delete ${sec}`}
                                    onClick={() => handleDeleteStation(sec)}
                                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1 transition-colors ml-2 shrink-0"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="pt-2 border-t border-border/60 space-y-2">
                            <div className="flex gap-1.5">
                              <Input
                                placeholder="New workstation name…"
                                value={newStationName}
                                onChange={(e) => {
                                  setNewStationName(e.target.value)
                                  setStationError(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleAddStation()
                                  }
                                }}
                                className="h-8 text-xs bg-background"
                              />
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 px-3 text-xs"
                                onClick={handleAddStation}
                              >
                                <Plus className="size-3.5 mr-1" /> Add
                              </Button>
                            </div>
                            {stationError && <p className="text-[11px] text-destructive">{stationError}</p>}
                            <div className="flex items-center justify-between pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  resetStations()
                                  setStationError(null)
                                }}
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                              >
                                <RotateCcw className="size-3" /> Reset to mall presets
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Field>
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
