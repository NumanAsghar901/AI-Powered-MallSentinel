import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Clock, ExternalLink, ShieldAlert, User as UserIcon, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SectionBadge } from '@/components/Badges'
import { EvidenceSourceBadge, ReviewStatusBadge } from '@/components/evidence/EvidenceBadges'
import { SeverityBadge } from '@/components/penalty/PenaltyBadges'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { CctvEvidence } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

interface Props {
  evidence: CctvEvidence | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function EvidenceReviewDialog({ evidence, open, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth()
  const isSupervisor = user?.role === 'supervisor'
  const queryClient = useQueryClient()
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (evidence) {
      setRemarks(evidence.supervisor_remarks ?? '')
      setError(null)
    }
  }, [evidence])

  const reviewMutation = useMutation({
    mutationFn: async ({ action }: { action: 'approve' | 'reject' }) => {
      if (!evidence) return
      return api.evidence.review(evidence.id, {
        action,
        remarks: remarks.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] })
      onSuccess?.()
      onOpenChange(false)
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to submit review.')
    },
  })

  if (!evidence) return null

  const imageUrl = evidence.image_url?.startsWith('http') ? evidence.image_url : api.evidence.imageUrl(evidence.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <EvidenceSourceBadge source={evidence.evidence_source} />
                <ReviewStatusBadge status={evidence.review_status} />
              </div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-brand-teal" />
                {evidence.violation_type}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {evidence.camera_id} • {evidence.camera_location} • Captured {formatDateTime(evidence.captured_at)}
              </DialogDescription>
            </div>
            <SeverityBadge severity={evidence.severity} />
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Annotated Image View */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                AI Detection Frame (YOLO Overlays)
              </span>
              <a
                href={imageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-teal hover:underline flex items-center gap-1"
              >
                Open Full Size <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="relative rounded-lg overflow-hidden border bg-black shadow-inner aspect-video flex items-center justify-center">
              <img
                src={imageUrl}
                alt={`CCTV Evidence ${evidence.violation_type}`}
                className="w-full h-full object-contain"
                loading="eager"
              />
            </div>
          </div>

          {/* Details Stack */}
          <div className="space-y-3 text-sm">
            {/* Department Section (1 Full Row) */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Department Section</span>
              <div className="flex flex-wrap items-center gap-2">
                <SectionBadge department={evidence.department} />
                <span className="text-xs font-mono text-muted-foreground">{evidence.camera_location}</span>
              </div>
            </div>

            {/* Identified Personnel (Below Department Section in 1 Complete Row with Full Email) */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Identified Personnel</span>
              {evidence.employee ? (
                <div className="rounded-md border bg-background/80 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-brand-teal shrink-0" aria-hidden />
                    <span className="font-semibold text-foreground text-sm">{evidence.employee.full_name}</span>
                    {evidence.employee.employee_code && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border shrink-0">
                        {evidence.employee.employee_code}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-foreground font-mono bg-muted/50 px-2.5 py-1 rounded border select-all">
                    {evidence.employee.email}
                  </span>
                </div>
              ) : (
                <div className="rounded-md border bg-background/50 px-3 py-2 text-muted-foreground italic text-xs">
                  Unassigned / Unknown Subject
                </div>
              )}
            </div>

            {/* Detection Confidence (1 Full Row) */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Detection Confidence</span>
              <div className="flex items-center gap-3">
                <div className="w-36 bg-muted rounded-full h-2.5 overflow-hidden border">
                  <div
                    className="bg-brand-teal h-full rounded-full transition-all"
                    style={{ width: `${Math.round(evidence.confidence_score * 100)}%` }}
                  />
                </div>
                <span className="font-mono font-semibold text-xs text-foreground">
                  {Math.round(evidence.confidence_score * 100)}%
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  (YOLOv8 Conf: {evidence.confidence_score.toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          {/* Detection Labels Breakdown */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detected Object Classes ({evidence.detection_labels.length})
            </span>
            <div className="flex flex-wrap gap-2">
              {evidence.detection_labels.map((item, idx) => {
                const isViolation = item.type === 'violation' || item.label.toLowerCase().includes('no ')
                return (
                  <span
                    key={idx}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${
                      isViolation
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                        : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-300'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="opacity-75">({(item.confidence * 100).toFixed(0)}%)</span>
                  </span>
                )
              })}
            </div>
          </div>

          {/* Previous Review Record if already reviewed */}
          {evidence.reviewed_by && (
            <div className="rounded-lg border p-3.5 bg-background space-y-1 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  Previously reviewed by <strong className="text-foreground">{evidence.reviewed_by.full_name}</strong> on{' '}
                  {evidence.reviewed_at ? formatDateTime(evidence.reviewed_at) : 'earlier date'}
                </span>
              </div>
              {evidence.supervisor_remarks && (
                <p className="italic text-muted-foreground pl-5 border-l-2 border-brand-teal/50 my-1">
                  "{evidence.supervisor_remarks}"
                </p>
              )}
            </div>
          )}

          {/* Review Decision Form */}
          <div className="space-y-3 pt-2 border-t">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
              Supervisor Review & Action Remarks
            </label>
            {isSupervisor ? (
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add supervisor notes, explanation, or disciplinary instructions..."
                rows={3}
                className="w-full text-sm p-3 rounded-md border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand-teal placeholder:text-muted-foreground/60 resize-none"
              />
            ) : (
              <div className="w-full text-sm p-3 rounded-md border bg-muted/40 text-muted-foreground italic">
                {evidence.supervisor_remarks
                  ? `Supervisor remark: "${evidence.supervisor_remarks}"`
                  : 'Review decisions (Approve / Reject) and remarks are reserved for Department Supervisors.'}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-rose-500 text-xs bg-rose-500/10 p-2.5 rounded border border-rose-500/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 px-6 border-t bg-muted/20 flex flex-row items-center justify-between sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>

          {isSupervisor ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ action: 'reject' })}
                className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
              >
                <XCircle className="h-4 w-4 mr-1.5" /> Reject Violation
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ action: 'approve' })}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve Violation
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Review decisions (Approve / Reject) reserved for Supervisors</span>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
