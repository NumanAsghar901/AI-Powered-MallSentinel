import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Camera, History } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Field } from '@/components/FormField'
import { SeverityBadge } from '@/components/penalty/PenaltyBadges'
import { InlineAlert } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  ACTION_LABELS,
  REASON_LABELS,
  REASONS_BY_DEPARTMENT,
  type Penalty,
  type PenaltyAction,
  type PenaltyReason,
  type Severity,
  type User,
} from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

const schema = z
  .object({
    employee_id: z.string().min(1, 'Select an employee'),
    reason: z.string().min(1, 'Select a reason'),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    action: z.enum(['verbal_warning', 'written_warning', 'fine', 'suspension', 'other']),
    amount: z.string(),
    days: z.string(),
    notes: z.string().max(1000, 'Keep notes under 1000 characters'),
    evidence_id: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === 'fine' && !(Number(v.amount) > 0)) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter the fine in PKR' })
    }
    if (v.action === 'suspension' && !(Number(v.days) >= 1 && Number(v.days) <= 90)) {
      ctx.addIssue({ code: 'custom', path: ['days'], message: 'Enter 1 to 90 days' })
    }
  })
type FormValues = z.infer<typeof schema>

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const blank = (employeeId: string): FormValues => ({
  employee_id: employeeId,
  reason: '',
  severity: 'medium',
  action: 'written_warning',
  amount: '',
  days: '',
  notes: '',
  evidence_id: '',
})

/** Review an employee's record and issue a penalty. The employee is emailed on their account address. */
export function PenaltyDialog({
  open,
  onOpenChange,
  employee,
  onIssued,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-selects an employee (opened from the Employees page). */
  employee: User | null
  onIssued: (penalty: Penalty) => void
}) {
  const { user } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const reasons: PenaltyReason[] = user?.department ? REASONS_BY_DEPARTMENT[user.department.code] : ['other']

  const team = useQuery({
    queryKey: ['penalty-team'],
    queryFn: () => api.employees.list({ page_size: 100, status: 'active', sort: 'full_name', order: 'asc' }),
    enabled: open,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: blank(employee?.id ?? '') })

  useEffect(() => {
    if (open) {
      reset(blank(employee?.id ?? ''))
      setFormError(null)
    }
  }, [open, employee, reset])

  const employeeId = useWatch({ control, name: 'employee_id' })
  const action = useWatch({ control, name: 'action' })
  const evidenceId = useWatch({ control, name: 'evidence_id' })
  const chosen = team.data?.items.find((e) => e.id === employeeId) ?? (employee?.id === employeeId ? employee : undefined)

  // Query CCTV evidence for the department/employee (Only Approved evidences)
  const evidenceQuery = useQuery({
    queryKey: ['penalty-cctv-evidence', user?.department?.id, employeeId],
    queryFn: () =>
      api.evidence.list({
        department_id: user?.department?.id,
        review_status: 'approved',
        page_size: 50,
      }),
    enabled: open && Boolean(user?.department?.id),
  })

  const relevantEvidences = (evidenceQuery.data?.items ?? []).filter(
    (ev) =>
      ev.review_status === 'approved' &&
      (!employeeId || !ev.employee || ev.employee.id === employeeId)
  )
  const selectedEv = (evidenceQuery.data?.items ?? []).find((ev) => ev.id === evidenceId)

  // "Review": what has this employee already been penalised for?
  const history = useQuery({
    queryKey: ['penalty-history', employeeId],
    queryFn: () => api.penalties.list({ employee_id: employeeId, page_size: 3 }),
    enabled: open && Boolean(employeeId),
  })

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    try {
      const penalty = await api.penalties.create({
        employee_id: v.employee_id,
        reason: v.reason as PenaltyReason,
        severity: v.severity,
        action: v.action,
        ...(v.action === 'fine' ? { amount_pkr: Number(v.amount) } : {}),
        ...(v.action === 'suspension' ? { suspension_days: Number(v.days) } : {}),
        ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
        ...(v.evidence_id ? { evidence_id: v.evidence_id } : {}),
      })
      onIssued(penalty)
      onOpenChange(false)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Issue a penalty</DialogTitle>
          <DialogDescription>
            Review the employee&apos;s record, then decide. The penalty is saved in the audit trail and emailed to the
            employee.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
          {formError && <InlineAlert kind="error">{formError}</InlineAlert>}

          <Field label="Employee" error={errors.employee_id?.message}>
            {(p) => (
              <Controller
                control={control}
                name="employee_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={team.isLoading}>
                    <SelectTrigger {...p}>
                      <SelectValue placeholder={team.isLoading ? 'Loading…' : 'Select an employee'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(team.data?.items ?? (employee ? [employee] : [])).map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name}
                          {e.employee_code ? ` · ${e.employee_code}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </Field>

          {employeeId && (
            <div className="rounded-xl border bg-muted/40 p-3.5 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <History className="size-4 text-muted-foreground" aria-hidden />
                Record of {chosen?.full_name ?? 'this employee'}
              </p>
              {history.isPending ? (
                <p className="mt-1 text-muted-foreground">Loading…</p>
              ) : history.data && history.data.total > 0 ? (
                <>
                  <p className="mt-1 text-muted-foreground">
                    {history.data.total} earlier {history.data.total === 1 ? 'penalty' : 'penalties'}. Most recent:
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {history.data.items.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SeverityBadge severity={p.severity} />
                        <span>{p.reason_label}</span>
                        <span className="text-muted-foreground">
                          · {p.action_label} · {formatDateTime(p.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-muted-foreground">No earlier penalties. This would be their first.</p>
              )}
              {chosen && <p className="mt-2 text-xs text-muted-foreground">Notice goes to {chosen.email}.</p>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reason" error={errors.reason?.message}>
              {(p) => (
                <Controller
                  control={control}
                  name="reason"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...p}>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {reasons.map((r) => (
                          <SelectItem key={r} value={r}>
                            {REASON_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>
            <Field label="Severity" error={errors.severity?.message}>
              {(p) => (
                <Controller
                  control={control}
                  name="severity"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...p}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVERITIES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>
            <Field label="Penalty" error={errors.action?.message}>
              {(p) => (
                <Controller
                  control={control}
                  name="action"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...p}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ACTION_LABELS) as PenaltyAction[]).map((a) => (
                          <SelectItem key={a} value={a}>
                            {ACTION_LABELS[a]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>
            {action === 'fine' && (
              <Field label="Amount (PKR)" error={errors.amount?.message}>
                {(p) => <Input {...p} type="number" inputMode="numeric" min={1} {...register('amount')} />}
              </Field>
            )}
            {action === 'suspension' && (
              <Field label="Days suspended" error={errors.days?.message}>
                {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={90} {...register('days')} />}
              </Field>
            )}
          </div>

          <Field label="Notes for the employee (optional)" error={errors.notes?.message}>
            {(p) => (
              <textarea
                {...p}
                rows={3}
                maxLength={1000}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground aria-[invalid=true]:border-destructive md:text-sm"
                placeholder="What happened, and anything they should do next"
                {...register('notes')}
              />
            )}
          </Field>

          <Field
            label="Attach Approved CCTV Evidence (Optional)"
            hint="Only supervisor-approved violations are available to attach to formal penalty notices."
          >
            {(p) => (
              <Controller
                control={control}
                name="evidence_id"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(val) => field.onChange(val === 'none' ? '' : val)}
                      disabled={evidenceQuery.isLoading}
                    >
                      <SelectTrigger {...p}>
                        <SelectValue placeholder={evidenceQuery.isLoading ? 'Loading approved evidence…' : 'Select approved CCTV evidence'} />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        <SelectItem value="none">No CCTV evidence attached</SelectItem>
                        {relevantEvidences.map((ev) => (
                          <SelectItem key={ev.id} value={ev.id}>
                            ✓ [{ev.camera_id}] {ev.violation_type} • {ev.camera_location} ({formatDateTime(ev.captured_at)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedEv && (
                      <div className="rounded-xl border bg-black/70 p-3 flex items-center gap-3 overflow-hidden shadow-inner">
                        <img
                          src={selectedEv.image_url?.startsWith('http') ? selectedEv.image_url : api.evidence.imageUrl(selectedEv.id)}
                          alt="CCTV Thumbnail"
                          className="w-24 h-16 object-cover rounded-lg border border-white/20 shrink-0 bg-black"
                        />
                        <div className="text-xs space-y-1 min-w-0">
                          <div className="font-semibold text-rose-400 truncate flex items-center gap-1.5">
                            <Camera className="size-3.5 text-cyan-400" />
                            {selectedEv.violation_type}
                          </div>
                          <div className="text-muted-foreground truncate">{selectedEv.camera_id} • {selectedEv.camera_location}</div>
                          <div className="text-[11px] text-cyan-300 font-mono">
                            {(selectedEv.confidence_score * 100).toFixed(0)}% AI Detection Conf • Will be attached to email
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              />
            )}
          </Field>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Issue penalty and email employee
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** One consistent message about what happened to the email. */
export function penaltyToast(p: Penalty): { ok: boolean; message: string } {
  switch (p.email_status) {
    case 'sent':
      return { ok: true, message: `Penalty issued. ${p.employee.full_name} was emailed at ${p.employee.email}.` }
    case 'not_configured':
      return { ok: false, message: 'Penalty issued, but Gmail is not set up yet, so no email was sent. Ask the admin to add the Gmail App Password.' }
    default:
      return { ok: false, message: 'Penalty issued, but the email could not be sent. You can resend it from the Penalties page.' }
  }
}
