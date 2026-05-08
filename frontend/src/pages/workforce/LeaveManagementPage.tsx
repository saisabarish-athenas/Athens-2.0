import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, Calendar, Clock, CheckCircle, XCircle,
  User, Loader2, Inbox, FileText, AlertCircle, ChevronDown
} from 'lucide-react'
import { workforceApi } from '../../services/workforceApi'
import { toast } from '../../lib/toast'
import { useAuthStore } from '../../store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaveType { id: number; name: string; days_allowed: number }

interface LeaveRequest {
  id: number
  employee: number
  employee_name: string
  employee_role: string
  leave_type: number
  leave_type_name: string
  start_date: string
  end_date: string
  days_count: number
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  requester_role: string
  assigned_approver: number | null
  approver_name: string | null
  approved_by: number | null
  approved_by_name: string | null
  approved_at: string | null
  rejection_reason: string
  can_approve: boolean
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  approved:  'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-300',
  rejected:  'bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-300',
  cancelled: 'bg-gray-100   text-gray-600   dark:bg-gray-800      dark:text-gray-400',
}

const ROLE_LABEL: Record<string, string> = {
  user:        'Employee',
  admin:       'Admin',
  client:      'Client Admin',
  epc:         'EPC Admin',
  contractor:  'Contractor Admin',
  masteradmin: 'Master Admin',
  superadmin:  'Super Admin',
}

function parseList(res: any): any[] {
  return Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
}

function calcDays(start: string, end: string): number {
  if (!start || !end) return 0
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(0, Math.ceil(diff / 86400000) + 1)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({ title, value, icon, color = 'text-primary' }: {
  title: string; value: number; icon: React.ReactNode; color?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className={`p-2 rounded-lg bg-accent ${color} w-fit mb-3`}>{icon}</div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{title}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}>
      {status}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({ leave, onClose, onConfirm }: {
  leave: LeaveRequest
  onClose: () => void
  onConfirm: (id: number, reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    await onConfirm(leave.id, reason)
    setBusy(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground mb-1">Reject Leave Request</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Rejecting <strong>{leave.employee_name}</strong>'s {leave.leave_type_name} request
          ({leave.start_date} → {leave.end_date}).
        </p>
        <label className="block text-sm font-medium text-foreground mb-2">
          Reason for Rejection <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Enter reason for rejection..."
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none mb-4"
        />
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm bg-accent text-foreground rounded-lg hover:bg-accent/80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Leave Card ───────────────────────────────────────────────────────────────

function LeaveCard({
  leave, currentUserId, isInbox,
  onApprove, onReject
}: {
  leave: LeaveRequest
  currentUserId: number
  isInbox: boolean
  onApprove: (l: LeaveRequest) => void
  onReject: (l: LeaveRequest) => void
}) {
  const isSelf = leave.employee === currentUserId

  return (
    <div className="flex items-start gap-3 p-4 bg-accent/50 border border-border/50 rounded-lg hover:bg-accent/70 transition-colors">
      <div className="p-2 rounded-full bg-primary/10 flex-shrink-0 mt-0.5">
        <User className="w-4 h-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-semibold text-foreground text-sm">{leave.employee_name || 'Unknown'}</span>
          <RoleBadge role={leave.requester_role || leave.employee_role || 'user'} />
          <span className="text-muted-foreground text-xs">•</span>
          <span className="text-sm text-muted-foreground">{leave.leave_type_name}</span>
          <StatusBadge status={leave.status} />
        </div>

        {/* Reason */}
        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{leave.reason}</p>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {leave.start_date} → {leave.end_date}
          </span>
          <span>{leave.days_count} day{leave.days_count !== 1 ? 's' : ''}</span>
          <span>Applied: {new Date(leave.created_at).toLocaleDateString()}</span>
          {leave.approver_name && leave.status === 'pending' && (
            <span className="text-blue-600 dark:text-blue-400">Approver: {leave.approver_name}</span>
          )}
          {leave.approved_by_name && leave.status !== 'pending' && (
            <span>{leave.status === 'approved' ? 'Approved' : 'Actioned'} by: {leave.approved_by_name}</span>
          )}
        </div>

        {/* Rejection reason */}
        {leave.status === 'rejected' && leave.rejection_reason && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>{leave.rejection_reason}</span>
          </div>
        )}

        {/* Self-approval warning */}
        {isSelf && leave.status === 'pending' && isInbox && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" />
            You cannot approve your own leave request.
          </div>
        )}
      </div>

      {/* Action buttons */}
      {leave.can_approve && !isSelf && (
        <div className="flex gap-2 flex-shrink-0 mt-0.5">
          <button
            onClick={() => onApprove(leave)}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium transition-colors flex items-center gap-1"
          >
            <CheckCircle className="h-3 w-3" /> Approve
          </button>
          <button
            onClick={() => onReject(leave)}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-medium transition-colors flex items-center gap-1"
          >
            <XCircle className="h-3 w-3" /> Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeaveManagementPage() {
  const { user } = useAuthStore()
  const currentUserId: number = (user as any)?.id ?? 0
  const userRole = (user as any)?.user_type === 'superadmin' ? 'superadmin'
    : (user as any)?.user_type === 'masteradmin' ? 'masteradmin'
    : (user as any)?.role_type === 'admin' ? 'admin'
    : 'user'

  const isApprover = ['superadmin', 'masteradmin', 'admin'].includes(userRole)

  // ── State ──
  const [tab, setTab] = useState<'my' | 'inbox' | 'all'>('my')
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [myRequests, setMyRequests]   = useState<LeaveRequest[]>([])
  const [inbox, setInbox]             = useState<LeaveRequest[]>([])
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([])
  const [leaveTypes, setLeaveTypes]   = useState<LeaveType[]>([])

  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null)

  const [form, setForm] = useState({
    leave_type: '', start_date: '', end_date: '', reason: ''
  })

  // ── Fetch ──
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const calls: Promise<any>[] = [
        workforceApi.getMyLeaveRequests(),
        workforceApi.getLeaveTypes(),
      ]
      if (isApprover) {
        calls.push(workforceApi.getLeaveInbox())
        calls.push(workforceApi.getLeaveRequests())
      }
      const results = await Promise.all(calls)
      setMyRequests(parseList(results[0]))
      setLeaveTypes(parseList(results[1]))
      if (isApprover) {
        setInbox(parseList(results[2]))
        setAllRequests(parseList(results[3]))
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load leave data')
    } finally {
      setLoading(false)
    }
  }, [isApprover])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Metrics ──
  const metrics = {
    total:    myRequests.length,
    pending:  myRequests.filter(r => r.status === 'pending').length,
    approved: myRequests.filter(r => r.status === 'approved').length,
    rejected: myRequests.filter(r => r.status === 'rejected').length,
    inbox:    inbox.length,
  }

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.leave_type || !form.start_date || !form.end_date || !form.reason.trim()) {
      toast.error('Please fill all required fields')
      return
    }
    const days = calcDays(form.start_date, form.end_date)
    if (days <= 0) { toast.error('End date must be on or after start date'); return }

    setSubmitting(true)
    try {
      await workforceApi.createLeaveRequest({
        leave_type: parseInt(form.leave_type),
        start_date: form.start_date,
        end_date: form.end_date,
        days_count: days,
        reason: form.reason.trim(),
      })
      toast.success('Leave request submitted successfully')
      setForm({ leave_type: '', start_date: '', end_date: '', reason: '' })
      setShowForm(false)
      fetchAll()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit leave request')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Approve ──
  const handleApprove = async (leave: LeaveRequest) => {
    if (leave.employee === currentUserId) {
      toast.error('You cannot approve your own leave request.')
      return
    }
    try {
      await workforceApi.approveLeaveRequest(leave.id)
      toast.success(`Leave approved for ${leave.employee_name}`)
      fetchAll()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve')
    }
  }

  // ── Reject ──
  const handleReject = async (id: number, reason: string) => {
    try {
      await workforceApi.rejectLeaveRequest(id, reason)
      toast.success('Leave request rejected')
      fetchAll()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reject')
    }
  }

  // ── Filter ──
  const applyFilter = (list: LeaveRequest[]) =>
    list.filter(l => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        l.employee_name?.toLowerCase().includes(q) ||
        l.reason?.toLowerCase().includes(q) ||
        l.leave_type_name?.toLowerCase().includes(q)
      const matchStatus = filterStatus === 'all' || l.status === filterStatus
      return matchSearch && matchStatus
    })

  const activeList = tab === 'my' ? applyFilter(myRequests)
    : tab === 'inbox' ? applyFilter(inbox)
    : applyFilter(allRequests)

  // ── Render ──
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Calendar className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Leave Management</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Hierarchical leave approval — no self-approval permitted
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex-shrink-0"
        >
          <Plus className="h-4 w-4" /> Apply Leave
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard title="Total Requests"    value={metrics.total}    icon={<FileText className="h-4 w-4" />} />
        <KPICard title="Pending"           value={metrics.pending}  icon={<Clock className="h-4 w-4" />}     color="text-yellow-600" />
        <KPICard title="Approved"          value={metrics.approved} icon={<CheckCircle className="h-4 w-4" />} color="text-green-600" />
        <KPICard title="Rejected"          value={metrics.rejected} icon={<XCircle className="h-4 w-4" />}   color="text-red-600" />
        {isApprover && (
          <KPICard title="Pending Approvals" value={metrics.inbox} icon={<Inbox className="h-4 w-4" />} color="text-blue-600" />
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabBtn active={tab === 'my'}    onClick={() => setTab('my')}>
          <FileText className="h-4 w-4" /> My Requests
          {metrics.pending > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-yellow-500 text-white text-xs leading-none">
              {metrics.pending}
            </span>
          )}
        </TabBtn>
        {isApprover && (
          <TabBtn active={tab === 'inbox'} onClick={() => setTab('inbox')}>
            <Inbox className="h-4 w-4" /> Approval Inbox
            {metrics.inbox > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-xs leading-none">
                {metrics.inbox}
              </span>
            )}
          </TabBtn>
        )}
        {isApprover && (
          <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>
            All Requests
          </TabBtn>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, reason, leave type..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="relative">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* List */}
      <div className="bg-card border border-border rounded-xl p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : activeList.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {tab === 'inbox' ? 'No pending approvals' : 'No leave requests found'}
            </p>
            {tab === 'my' && (
              <p className="text-sm mt-1">Click "Apply Leave" to submit a new request.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeList.map(leave => (
              <LeaveCard
                key={leave.id}
                leave={leave}
                currentUserId={currentUserId}
                isInbox={tab === 'inbox'}
                onApprove={handleApprove}
                onReject={l => setRejectTarget(l)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Apply Leave Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground mb-1">Apply for Leave</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Your request will be sent to your designated approver.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1.5">Leave Type *</label>
                  <select
                    required
                    value={form.leave_type}
                    onChange={e => setForm({ ...form, leave_type: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select leave type</option>
                    {leaveTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.days_allowed} days/year)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Start Date *</label>
                  <input
                    type="date" required value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">End Date *</label>
                  <input
                    type="date" required value={form.end_date}
                    onChange={e => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                {form.start_date && form.end_date && (
                  <div className="sm:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Duration: <strong className="text-foreground">{calcDays(form.start_date, form.end_date)} day(s)</strong></span>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1.5">Reason *</label>
                  <textarea
                    required rows={3} value={form.reason}
                    onChange={e => setForm({ ...form, reason: e.target.value })}
                    placeholder="Briefly describe the reason for your leave..."
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="submit" disabled={submitting}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit Request
                </button>
                <button
                  type="button" disabled={submitting}
                  onClick={() => { setShowForm(false); setForm({ leave_type: '', start_date: '', end_date: '', reason: '' }) }}
                  className="px-5 py-2 bg-accent text-foreground rounded-lg hover:bg-accent/80 disabled:opacity-50 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <RejectModal
          leave={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={handleReject}
        />
      )}
    </div>
  )
}

// ─── Tab button helper ────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
