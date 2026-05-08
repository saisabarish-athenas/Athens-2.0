import React, { useState, useEffect, useRef, useCallback } from 'react'
import { adminAttendanceApi, type AdminAttendanceRecord, type CorrectionPayload, type AttendanceDashboard } from '../../services/adminAttendanceApi'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  present:     'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  absent:      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  late:        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  half_day:    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  working:     'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  checked_out: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
}

const STATUS_LABELS: Record<string, string> = {
  present: 'Present', absent: 'Absent', late: 'Late',
  half_day: 'Half Day', working: 'Working', checked_out: 'Checked Out',
}

function toArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && Array.isArray((data as any).results)) {
    return (data as any).results as T[]
  }
  return []
}

function fmt(dt: string | null | undefined): string {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function KPI({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color} flex flex-col gap-1`}>
      <span className="text-2xl font-bold">{value ?? 0}</span>
      <span className="text-xs font-medium opacity-80">{label}</span>
    </div>
  )
}

// ─── Correction Modal ─────────────────────────────────────────────────────────
interface CorrectionModalProps {
  record: AdminAttendanceRecord
  onClose: () => void
  onSave: (id: number, payload: CorrectionPayload) => Promise<void>
}

function CorrectionModal({ record, onClose, onSave }: CorrectionModalProps) {
  const [checkIn, setCheckIn] = useState(record.check_in_time ? record.check_in_time.slice(0, 16) : '')
  const [checkOut, setCheckOut] = useState(record.check_out_time ? record.check_out_time.slice(0, 16) : '')
  const [statusVal, setStatusVal] = useState<string>(record.status ?? 'absent')
  const [note, setNote] = useState(record.correction_note ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(record.id, {
        check_in_time: checkIn || undefined,
        check_out_time: checkOut || undefined,
        status: statusVal,
        correction_note: note,
      })
      onClose()
    } catch (e: any) {
      setSaveError(e?.response?.data?.detail || e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Correct Attendance — {record.admin_name || record.admin_email}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Check In</label>
            <input type="datetime-local" value={checkIn} onChange={e => setCheckIn(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white" />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Check Out</label>
            <input type="datetime-local" value={checkOut} onChange={e => setCheckOut(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Status Override</label>
          <select value={statusVal} onChange={e => setStatusVal(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white">
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Correction Note</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white resize-none" />
        </div>
        {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface EBState { hasError: boolean; message: string }
class AttendanceErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' }
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err?.message || 'Unknown error' }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-64 gap-4 p-8">
          <div className="text-red-500 text-lg font-semibold">Failed to load Admin Attendance dashboard.</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg max-w-lg text-center break-all">
            {this.state.message}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const AdminAttendancePageInner: React.FC = () => {
  const [dashboard, setDashboard] = useState<AttendanceDashboard | null>(null)
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [correcting, setCorrecting] = useState<AdminAttendanceRecord | null>(null)

  // Filters — use refs for the interval callback to avoid stale closures
  const [filterDate, setFilterDate] = useState(todayStr)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAdminType, setFilterAdminType] = useState('')
  const [search, setSearch] = useState('')

  // Keep latest filter values accessible inside the interval without re-creating it
  const filtersRef = useRef({ filterDate, filterStatus, filterAdminType, search })
  useEffect(() => {
    filtersRef.current = { filterDate, filterStatus, filterAdminType, search }
  }, [filterDate, filterStatus, filterAdminType, search])

  const fetchData = useCallback(async (filters: typeof filtersRef.current) => {
    setLoading(true)
    setError(null)
    try {
      const [dashRaw, listRaw] = await Promise.allSettled([
        adminAttendanceApi.getDashboard(),
        adminAttendanceApi.getList({
          date: filters.filterDate,
          status: filters.filterStatus || undefined,
          admin_type: filters.filterAdminType || undefined,
          search: filters.search || undefined,
        }),
      ])

      if (dashRaw.status === 'fulfilled') {
        setDashboard(dashRaw.value ?? null)
      }

      if (listRaw.status === 'fulfilled') {
        // Normalize: backend may return array or paginated {results:[]}
        setRecords(toArray<AdminAttendanceRecord>(listRaw.value))
      } else {
        // List failed but dashboard may have succeeded — show empty table, not crash
        setRecords([])
        const err = (listRaw.reason as any)
        // Only set error if it's not a token/auth issue (those are handled globally)
        const code = err?.code
        if (code !== 'NO_VALID_AUTH_TOKEN' && code !== 'NO_AUTH_TOKEN') {
          const msg = err?.response?.data?.detail || err?.message || 'Failed to load records'
          setError(msg)
        }
      }
    } catch (e: any) {
      const code = e?.code
      if (code !== 'NO_VALID_AUTH_TOKEN' && code !== 'NO_AUTH_TOKEN') {
        setError(e?.response?.data?.detail || e?.message || 'Failed to load attendance')
      }
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, []) // stable — no filter deps here; filters passed as argument

  // Load on filter change
  useEffect(() => {
    fetchData(filtersRef.current)
  }, [filterDate, filterStatus, filterAdminType, search, fetchData])

  // Auto-refresh every 60s using stable interval (reads latest filters via ref)
  useEffect(() => {
    const id = setInterval(() => fetchData(filtersRef.current), 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  const handleForceCheckout = async (record: AdminAttendanceRecord) => {
    if (!window.confirm(`Force checkout ${record.admin_name || record.admin_email}?`)) return
    try {
      const updated = await adminAttendanceApi.forceCheckout(record.id, 'Force checkout by Master Admin')
      setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to force checkout'
      window.alert(msg)
    }
  }

  const handleCorrect = async (id: number, payload: CorrectionPayload) => {
    const updated = await adminAttendanceApi.correct(id, payload)
    setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  const handleExport = () => {
    const url = adminAttendanceApi.getExportUrl(filterDate, filterDate)
    window.open(url, '_blank')
  }

  const handleRefresh = () => fetchData(filtersRef.current)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Attendance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Monitor and manage admin attendance across all projects
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Dashboard */}
      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <KPI label="Total Admins" value={dashboard.total_admins} color="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" />
          <KPI label="Present"      value={dashboard.present}      color="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300" />
          <KPI label="Absent"       value={dashboard.absent}       color="bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300" />
          <KPI label="Late"         value={dashboard.late}         color="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300" />
          <KPI label="Half Day"     value={dashboard.half_day}     color="bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300" />
          <KPI label="Working"      value={dashboard.working}      color="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300" />
          <KPI label="Checked Out"  value={dashboard.checked_out}  color="bg-gray-50 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300" />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white"
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={filterAdminType}
            onChange={e => setFilterAdminType(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white"
          >
            <option value="">All Admin Types</option>
            <option value="client">Client Admin</option>
            <option value="epc">EPC Admin</option>
            <option value="contractor">Contractor Admin</option>
            <option value="project_admin">Project Admin</option>
            <option value="owner">Owner</option>
          </select>
          <input
            type="text"
            placeholder="Search name, org, project…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-red-500 text-sm">{error}</p>
            <button onClick={handleRefresh} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              Retry
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No attendance records for this date</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  {['Admin Name', 'Type', 'Organization', 'Project', 'Check In', 'Check Out', 'Hours', 'Status', 'GPS', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{r.admin_name || '—'}</div>
                      <div className="text-xs text-gray-400">{r.admin_email || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize whitespace-nowrap">
                      {r.admin_role || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[140px] truncate">
                      {r.organization || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[120px] truncate">
                      {r.project_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {fmt(r.check_in_time)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {fmt(r.check_out_time)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {r.total_hours && parseFloat(r.total_hours) > 0
                        ? `${parseFloat(r.total_hours).toFixed(1)}h`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status || 'absent'} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {r.check_in_location
                        ? (
                          <span
                            title={`${r.check_in_location.lat?.toFixed(4)}, ${r.check_in_location.lng?.toFixed(4)}`}
                            className="cursor-help"
                          >
                            📍 In
                          </span>
                        )
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCorrecting(r)}
                          className="px-2 py-1 text-xs rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 whitespace-nowrap"
                        >
                          Correct
                        </button>
                        {r.status === 'working' && (
                          <button
                            onClick={() => handleForceCheckout(r)}
                            className="px-2 py-1 text-xs rounded-md bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50 whitespace-nowrap"
                          >
                            Force Out
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Correction Modal */}
      {correcting && (
        <CorrectionModal
          record={correcting}
          onClose={() => setCorrecting(null)}
          onSave={handleCorrect}
        />
      )}
    </div>
  )
}

// ─── Exported page wrapped in error boundary ──────────────────────────────────
const AdminAttendancePage: React.FC = () => (
  <AttendanceErrorBoundary>
    <AdminAttendancePageInner />
  </AttendanceErrorBoundary>
)

export default AdminAttendancePage
