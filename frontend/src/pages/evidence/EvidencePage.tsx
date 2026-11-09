import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Camera,
  Cpu,
  Eye,
  Search,
} from 'lucide-react'
import { useState } from 'react'
import { SectionBadge } from '@/components/Badges'
import { EvidenceReviewDialog } from '@/components/evidence/EvidenceReviewDialog'
import { EvidenceSourceBadge, ReviewStatusBadge } from '@/components/evidence/EvidenceBadges'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { SeverityBadge } from '@/components/penalty/PenaltyBadges'
import { EmptyState, ErrorState } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDebounced } from '@/lib/hooks'
import type { CctvEvidence, EvidenceListParams, EvidenceReviewStatus, Severity } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

const ALL = 'all'
const PAGE_SIZE = 9

export function EvidencePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState<string>(ALL)
  const [reviewStatus, setReviewStatus] = useState<EvidenceReviewStatus | typeof ALL>(ALL)
  const [severity, setSeverity] = useState<Severity | typeof ALL>(ALL)
  const [evidenceSource, setEvidenceSource] = useState<string>(ALL)
  const [page, setPage] = useState(1)

  const [selectedEvidence, setSelectedEvidence] = useState<CctvEvidence | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const debouncedSearch = useDebounced(search.trim())

  const params: EvidenceListParams = {
    page,
    page_size: PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(departmentId !== ALL ? { department_id: Number(departmentId) } : {}),
    ...(reviewStatus !== ALL ? { review_status: reviewStatus } : {}),
    ...(severity !== ALL ? { severity } : {}),
    ...(evidenceSource !== ALL ? { evidence_source: evidenceSource } : {}),
  }

  const { data: depts } = useQuery({
    queryKey: ['departments'],
    queryFn: api.departments.list,
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['evidence', params],
    queryFn: () => api.evidence.list(params),
    placeholderData: keepPreviousData,
  })

  const openReview = (ev: CctvEvidence) => {
    setSelectedEvidence(ev)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="CCTV Detection Evidence"
        description="YOLO object-detection compliance monitoring records. Review captured violations, inspect bounding boxes, and approve or reject incident decisions."
        actions={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-cyan-300 border border-brand-teal/30">
            <Cpu className="h-3.5 w-3.5" />
            30 YOLO Evidence Records
          </span>
        }
      />

      {/* Filter Bar */}
      <Card className="p-4 bg-card/60 backdrop-blur-sm border shadow-sm">
        <div className="flex flex-col md:flex-row flex-wrap gap-3 items-stretch md:items-center justify-between">
          <div className="flex-1 min-w-[220px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search camera, violation, location..."
              className="pl-9 h-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Admin-only Department filter */}
            {isAdmin && (
              <Select
                value={departmentId}
                onValueChange={(v) => {
                  setDepartmentId(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[145px] h-9">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Sections</SelectItem>
                  {depts?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Evidence Source filter */}
            <Select
              value={evidenceSource}
              onValueChange={(v) => {
                setEvidenceSource(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[135px] h-9">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Sources</SelectItem>
                <SelectItem value="DUMMY">DUMMY Only</SelectItem>
              </SelectContent>
            </Select>

            {/* Review Status filter */}
            <Select
              value={reviewStatus}
              onValueChange={(v) => {
                setReviewStatus(v as EvidenceReviewStatus | typeof ALL)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[145px] h-9">
                <SelectValue placeholder="Review Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            {/* Severity filter */}
            <Select
              value={severity}
              onValueChange={(v) => {
                setSeverity(v as Severity | typeof ALL)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Severities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Content State Handling */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-44 w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Please check connection.'}
          onRetry={() => {
            void refetch()
          }}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Camera className="size-6" />}
          title="No evidence records found"
          description="Try broadening your search or resetting filters."
        />
      ) : (
        <div className="space-y-6">
          {/* Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.items.map((ev) => (
              <Card
                key={ev.id}
                className="group flex flex-col overflow-hidden border hover:border-brand-teal/50 hover:shadow-md transition-all duration-200 bg-card/90"
              >
                {/* CCTV Frame Thumbnail with Overlay */}
                <div
                  className="relative aspect-video bg-black cursor-pointer overflow-hidden group/thumb"
                  onClick={() => openReview(ev)}
                >
                  <img
                    src={ev.image_url?.startsWith('http') ? ev.image_url : api.evidence.imageUrl(ev.id)}
                    alt={ev.violation_type}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

                  {/* Top Badges inside image */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 pointer-events-none">
                    <span className="font-mono text-[11px] font-semibold text-white/95 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                      {ev.camera_id}
                    </span>
                    <EvidenceSourceBadge source={ev.evidence_source} />
                  </div>

                  {/* Hover Inspect Pill */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                    <span className="px-3.5 py-1.5 rounded-full bg-brand-teal text-white font-medium text-xs flex items-center gap-1.5 shadow-lg">
                      <Eye className="h-3.5 w-3.5" /> Inspect Bounding Boxes
                    </span>
                  </div>

                  {/* Bottom Image Info */}
                  <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[11px] text-white/90 pointer-events-none font-mono">
                    <span>{ev.camera_location}</span>
                    <span className="font-bold text-cyan-300">{(ev.confidence_score * 100).toFixed(0)}% Conf</span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <SectionBadge department={ev.department} />
                      <SeverityBadge severity={ev.severity} />
                    </div>

                    <h3
                      className="font-bold text-base text-foreground leading-tight line-clamp-1 cursor-pointer hover:text-brand-teal transition-colors"
                      onClick={() => openReview(ev)}
                    >
                      {ev.violation_type}
                    </h3>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Staff:</span>
                        <strong className="text-foreground">{ev.employee?.full_name ?? 'Unassigned'}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Time:</span>
                        <span>{formatDateTime(ev.captured_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer status & button */}
                  <div className="pt-3 border-t flex items-center justify-between gap-2">
                    <ReviewStatusBadge status={ev.review_status} />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-medium hover:bg-brand-teal hover:text-white hover:border-brand-teal transition-colors"
                      onClick={() => openReview(ev)}
                    >
                      Inspect & Review
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
        </div>
      )}

      {/* Full Inspection & Review Modal Dialog */}
      <EvidenceReviewDialog
        evidence={selectedEvidence}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => refetch()}
      />
    </div>
  )
}
