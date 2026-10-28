import { AlertOctagon, AlertTriangle, Info, MailCheck, MailQuestion, MailWarning, Siren } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { EmailStatus, Severity } from '@/lib/types'

/** Severity scale: Low / Medium / High / Critical, each with its own colour and icon (never the section colours). */
export function SeverityBadge({ severity }: { severity: Severity }) {
  switch (severity) {
    case 'low':
      return (
        <Badge variant="info">
          <Info aria-hidden /> Low
        </Badge>
      )
    case 'medium':
      return (
        <Badge variant="warning">
          <AlertTriangle aria-hidden /> Medium
        </Badge>
      )
    case 'high':
      return (
        <Badge className="border-transparent bg-[hsl(24_95%_92%)] text-[hsl(24_90%_36%)] dark:bg-[hsl(24_60%_16%)] dark:text-[hsl(24_95%_64%)]">
          <AlertOctagon aria-hidden /> High
        </Badge>
      )
    case 'critical':
      return (
        <Badge variant="danger">
          <Siren aria-hidden /> Critical
        </Badge>
      )
  }
}

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  switch (status) {
    case 'sent':
      return (
        <Badge variant="success">
          <MailCheck aria-hidden /> Emailed
        </Badge>
      )
    case 'failed':
      return (
        <Badge variant="danger">
          <MailWarning aria-hidden /> Email failed
        </Badge>
      )
    case 'not_configured':
      return (
        <Badge variant="warning">
          <MailWarning aria-hidden /> Email not set up
        </Badge>
      )
    default:
      return (
        <Badge variant="neutral">
          <MailQuestion aria-hidden /> Sending
        </Badge>
      )
  }
}
