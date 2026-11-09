import { CheckCircle2, Clock, Cpu, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { EvidenceReviewStatus } from '@/lib/types'

export function ReviewStatusBadge({ status }: { status: EvidenceReviewStatus }) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="warning">
          <Clock className="h-3 w-3" aria-hidden /> Pending
        </Badge>
      )
    case 'approved':
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" aria-hidden /> Approved
        </Badge>
      )
    case 'rejected':
      return (
        <Badge variant="danger">
          <XCircle className="h-3 w-3" aria-hidden /> Rejected
        </Badge>
      )
  }
}

export function EvidenceSourceBadge({ source }: { source: string }) {
  return (
    <Badge
      variant="outline"
      className="border-brand-teal/40 bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-cyan-300 font-mono text-[11px]"
    >
      <Cpu className="h-3 w-3 mr-1" aria-hidden />
      {source}
    </Badge>
  )
}

