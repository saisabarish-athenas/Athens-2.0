import { useState, useEffect, useCallback } from 'react'
import {
  Clock, MapPin, CheckCircle, AlertCircle, LogOut, Calendar,
  Loader2, Users, UserCheck, UserX, Timer, Search, RefreshCw,
} from 'lucide-react'
import { apiClient } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────
const CHECKIN_THRESHOLD_HOUR = 9
const CHECKIN_THRESHOLD_MIN  = 0

// ── Types ─────────────────────────────────────────────────────────────────────
type AttendanceStatus = 'present' | 'late' | 'half_day' | 'absent' | 'checked_out' | 'not_marked' | null

interface TodayRecord {
  id: number
  date: string
  check_in_time: string | null
  check_out_time: string | null
  status: AttendanceStatus
  latitude: number | null
  longitude: number | null
}

interface DashboardRecord {
  id: number | null
  employee_id: number
  employee_code: string
  name: string
  email: string
  department: string
  designation: string
  check_in_time: string | null
  check_out_time: string | null
  status: string
  work_hours: string | null
  is_late: boolean
  latitude: number | null
  longitude: number | null
  has_record: boolean
}

interface DashboardData {
  date: string
  summary: { total: number; present: number; late: number; half_day: number; absent: number; checked_out?: number; not_marked?: number }
  records: DashboardRecord[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (t: string | null) => {
  if (!t) return '—'
  return (t.includes('T') ? t.split('T')[1] : t).slice(0, 5)
}

const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
  present:  { label: 'Present',  color: 'text-green-700 dark:text-green-300',   bg: 'bg-green-100 dark:bg-green-900/30' },
  late:     { label: 'Late',     color: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  half_day: { label: 'Half Day', color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/30' },
  absent:   { label: 'Absent',   color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/30' },
  checked_out: { label: 'Checked Out', color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-700/50' },
  not_marked: { label: 'Not Marked', color: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-gray-700/50' },
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
  })
}

// ── User Self-Service Panel ───────────────────────────────────────────────────
function UserAttendancePanel() {
  const { user } = useAuthStore()
  const username = (user as any)?.username || user?.email?.split('@')[0] || 'User'

  const [today]    = useState(new Date().toISOString().split('T')[0])
  const [record, setRecord]     = useState<TodayRecord | null>(null)
  const [loading, setLoading]   = useState(true)
  const [busy, setBusy]         = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [liveTime, setLiveTime] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setLiveTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const fetchToday = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/api/workforce/user-attendance/today/')
      setRecord(res.data ?? null)
    } catch (err: any) {
      if (err?.response?.status === 404) setRecord(null)
      else toast.error('Could not load attendance status.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchToday() }, [fetchToday])

  const getLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    setLocError(null)
    try {
      const pos = await getCurrentPosition()
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
    } catch (err: any) {
      setLocError(
        err?.code === 1 ? 'Location permission denied. Please enable location access.' :
        err?.code === 2 ? 'Location unavailable. Check your device settings.' :
        err?.code === 3 ? 'Location request timed out. Try again.' :
        'Unable to get location. Please enable location.'
      )
      return null
    }
  }

  const handleCheckIn = async () => {
    setBusy(true)
    const loc = await getLocation()
    if (!loc) { setBusy(false); return }
    const now = new Date()
    const isLate = now.getHours() > CHECKIN_THRESHOLD_HOUR ||
      (now.getHours() === CHECKIN_THRESHOLD_HOUR && now.getMinutes() > CHECKIN_THRESHOLD_MIN)
    try {
      const res = await apiClient.post('/api/workforce/user-attendance/', {
        date: today,
        check_in_time: now.toTimeString().slice(0, 8),
        latitude: loc.latitude, longitude: loc.longitude,
        status: isLate ? 'late' : 'present',
      })
      setRecord(res.data)
      toast.success(isLate ? 'Checked in — marked Late' : 'Attendance marked — Present!')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to mark attendance.')
    } finally { setBusy(false) }
  }

  const handleCheckOut = async () => {
    if (!record) return
    setBusy(true)
    const loc = await getLocation()
    if (!loc) { setBusy(false); return }
    const now = new Date()
    try {
      const res = await apiClient.patch(`/api/workforce/user-attendance/${record.id}/checkout/`, {
        check_out_time: now.toTimeString().slice(0, 8),
        latitude: loc.latitude, longitude: loc.longitude,
      })
      setRecord(res.data)
      toast.success('Clocked out successfully!')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to clock out.')
    } finally { setBusy(false) }
  }

  const checkedIn  = !!record?.check_in_time
  const checkedOut = !!record?.check_out_time
  const status     = record?.status ?? null

  const workHours = (() => {
    if (!record?.check_in_time || !record?.check_out_time) return null
    const [ih, im] = record.check_in_time.slice(0, 5).split(':').map(Number)
    const [oh, om] = record.check_out_time.slice(0, 5).split(':').map(Number)
    const mins = (oh * 60 + om) - (ih * 60 + im)
    return mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : null
  })()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Clock className="h-7 w-7 text-primary shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Attendance</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {liveTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 text-center shadow-sm">
          <div className="text-5xl font-mono font-bold text-gray-900 dark:text-white tracking-tight">
            {liveTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />{today}
          </div>
          <div className="mt-2 text-sm font-medium text-primary">👤 {username}</div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {checkedIn && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Status</span>
                  {status && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusMeta[status]?.bg} ${statusMeta[status]?.color}`}>
                      {statusMeta[status]?.label}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-0.5">Check-in</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">{fmt(record?.check_in_time ?? null)}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${checkedOut ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-100 dark:bg-gray-700/40'}`}>
                    <p className="text-xs text-gray-500 mb-0.5">Check-out</p>
                    <p className={`text-lg font-bold ${checkedOut ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400'}`}>
                      {checkedOut ? fmt(record?.check_out_time ?? null) : '—'}
                    </p>
                  </div>
                </div>
                {workHours && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Work hours: <span className="font-semibold text-gray-900 dark:text-white">{workHours}</span>
                  </div>
                )}
                {record?.latitude && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <MapPin className="h-3.5 w-3.5" />
                    {record.latitude.toFixed(5)}, {record.longitude?.toFixed(5)}
                  </div>
                )}
              </div>
            )}

            {locError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">Location Required</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{locError}</p>
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-3">
              {!checkedIn && (
                <button onClick={handleCheckIn} disabled={busy}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary text-primary-foreground rounded-2xl text-base font-semibold shadow-md hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
                  {busy ? 'Getting location…' : 'Mark Attendance'}
                </button>
              )}
              {checkedIn && !checkedOut && (
                <button onClick={handleCheckOut} disabled={busy}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-red-600 text-white rounded-2xl text-base font-semibold shadow-md hover:bg-red-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                  {busy ? 'Getting location…' : 'Clock Out'}
                </button>
              )}
              {checkedIn && checkedOut && (
                <div className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-2xl text-base font-semibold">
                  <CheckCircle className="h-5 w-5 text-green-500" /> Attendance Complete for Today
                </div>
              )}
              <p className="text-xs text-gray-400 text-center">
                {!checkedIn && 'Location will be captured automatically on click.'}
                {checkedIn && !checkedOut && 'Click Clock Out when you leave for the day.'}
                {checkedIn && checkedOut && 'See you tomorrow!'}
              </p>
            </div>
          </>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p>📍 Location is required to mark attendance.</p>
          <p>⏰ Check-in after {CHECKIN_THRESHOLD_HOUR}:00 AM is marked as <strong>Late</strong>.</p>
          <p>🕐 No clock-out by end of day is marked as <strong>Half Day</strong>.</p>
        </div>
      </div>
    </div>
  )
}

function AdminSelfAttendancePanel({ onRefresh }: { onRefresh: () => void }) {
  const { user } = useAuthStore()
  const [today] = useState(new Date().toISOString().split('T')[0])
  const [record, setRecord] = useState<TodayRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [liveTime, setLiveTime] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setLiveTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const fetchRecord = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/api/workforce/user-attendance/today/')
      setRecord(res.data ?? null)
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setRecord(null)
      } else {
        toast.error('Could not load your attendance.')
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchRecord() }, [fetchRecord])

  const getLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    setLocError(null)
    try {
      const pos = await getCurrentPosition()
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
    } catch (err: any) {
      setLocError(
        err?.code === 1 ? 'Location permission denied. Please enable location access.' :
        err?.code === 2 ? 'Location unavailable. Check your device settings.' :
        err?.code === 3 ? 'Location request timed out. Try again.' :
        'Unable to get location. Please enable location.'
      )
      return null
    }
  }

  const handleCheckIn = async () => {
    setBusy(true)
    const loc = await getLocation()
    if (!loc) { setBusy(false); return }
    const now = new Date()
    const isLate = now.getHours() > CHECKIN_THRESHOLD_HOUR || (now.getHours() === CHECKIN_THRESHOLD_HOUR && now.getMinutes() > CHECKIN_THRESHOLD_MIN)
    try {
      const res = await apiClient.post('/api/workforce/user-attendance/', {
        date: today,
        check_in_time: now.toTimeString().slice(0, 8),
        latitude: loc.latitude,
        longitude: loc.longitude,
        status: isLate ? 'late' : 'present',
      })
      setRecord(res.data)
      toast.success(isLate ? 'Checked in — marked Late' : 'Attendance marked — Present!')
      onRefresh()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to mark attendance.')
    } finally { setBusy(false) }
  }

  const handleCheckOut = async () => {
    if (!record) return
    setBusy(true)
    const loc = await getLocation()
    if (!loc) { setBusy(false); return }
    const now = new Date()
    try {
      const res = await apiClient.patch(`/api/workforce/user-attendance/${record.id}/checkout/`, {
        check_out_time: now.toTimeString().slice(0, 8),
        latitude: loc.latitude,
        longitude: loc.longitude,
      })
      setRecord(res.data)
      toast.success('Clocked out successfully!')
      onRefresh()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to clock out.')
    } finally { setBusy(false) }
  }

  const checkedIn = !!record?.check_in_time
  const checkedOut = !!record?.check_out_time
  const status = record?.status ?? null
  const workHours = (() => {
    if (!record?.check_in_time || !record?.check_out_time) return null
    const [ih, im] = record.check_in_time.slice(0, 5).split(':').map(Number)
    const [oh, om] = record.check_out_time.slice(0, 5).split(':').map(Number)
    const mins = (oh * 60 + om) - (ih * 60 + im)
    return mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : null
  })()

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary"><Clock className="h-5 w-5" /> <span className="text-sm font-semibold">My Attendance</span></div>
          <h2 className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{(user as any)?.name || (user as any)?.username || 'Admin'}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-mono font-bold text-gray-900 dark:text-white tracking-tight">{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Today: {today}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-gray-100 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/60">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Check-In</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{fmt(record?.check_in_time ?? null)}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/60">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Check-Out</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{fmt(record?.check_out_time ?? null)}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/60">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
            <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{statusMeta[status ?? 'not_marked']?.label || 'Not Marked'}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/60">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Working Hours</p>
            <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{workHours ?? '—'}</p>
          </div>
        </div>
      )}

      {locError && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          {locError}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {!checkedIn && (
          <button onClick={handleCheckIn} disabled={busy}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {busy ? 'Processing…' : 'Clock In'}
          </button>
        )}
        {checkedIn && !checkedOut && (
          <button onClick={handleCheckOut} disabled={busy}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {busy ? 'Processing…' : 'Clock Out'}
          </button>
        )}
        {checkedIn && checkedOut && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-5 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">Attendance complete for today</div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {!checkedIn && 'Location will be captured automatically when you clock in.'}
        {checkedIn && !checkedOut && 'Clock out when your shift ends to complete attendance.'}
        {checkedIn && checkedOut && 'Your attendance is recorded for today.'}
      </p>
    </div>
  )
}

// ── Admin Dashboard Panel ─────────────────────────────────────────────────────
function AdminAttendanceDashboard() {
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0])
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [data, setData]         = useState<DashboardData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [actionBusy, setActionBusy] = useState<number | null>(null)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date })
      if (search)       params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      const res = await apiClient.get(`/api/workforce/user-attendance/dashboard/?${params}`)
      setData(res.data)
    } catch {
      toast.error('Failed to load attendance dashboard.')
    } finally { setLoading(false) }
  }, [date, search, statusFilter])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  const currentTime = () => new Date().toTimeString().slice(0, 5)

  const runAttendanceAction = async (record: DashboardRecord, action: 'checkin' | 'checkout' | 'override') => {
    setActionBusy(record.employee_id)
    try {
      if (action === 'checkin') {
        await apiClient.post('/api/workforce/user-attendance/admin_checkin/', {
          employee_id: record.employee_id,
          date,
          check_in_time: currentTime(),
        })
        toast.success(`Checked in ${record.name}`)
      } else if (action === 'checkout') {
        await apiClient.post('/api/workforce/user-attendance/admin_checkout/', {
          employee_id: record.employee_id,
          date,
          check_out_time: currentTime(),
        })
        toast.success(`Checked out ${record.name}`)
      } else {
        const checkIn = window.prompt('Check-in time (HH:mm)', record.check_in_time || '09:00')
        if (checkIn === null) return
        const checkOut = window.prompt('Check-out time (HH:mm, optional)', record.check_out_time || '')
        if (checkOut === null) return
        await apiClient.post('/api/workforce/user-attendance/admin_checkin/', {
          employee_id: record.employee_id,
          date,
          check_in_time: checkIn,
          check_out_time: checkOut || null,
        })
        toast.success(`Corrected attendance for ${record.name}`)
      }
      await fetchDashboard()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Attendance action failed.')
    } finally {
      setActionBusy(null)
    }
  }

  const summary = data?.summary
  const records = data?.records ?? []

  const kpis = [
    { label: 'Total',    value: summary?.total    ?? 0, icon: <Users className="h-5 w-5" />,     color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Present',  value: summary?.present  ?? 0, icon: <UserCheck className="h-5 w-5" />, color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'Absent',   value: summary?.absent   ?? 0, icon: <UserX className="h-5 w-5" />,     color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: 'Late',     value: summary?.late     ?? 0, icon: <Clock className="h-5 w-5" />,     color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
    { label: 'Half Day', value: summary?.half_day ?? 0, icon: <Timer className="h-5 w-5" />,     color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { label: 'Checked Out', value: summary?.checked_out ?? 0, icon: <LogOut className="h-5 w-5" />, color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-900/20' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Clock className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Attendance Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Real-time employee attendance overview</p>
          </div>
        </div>
        <button onClick={fetchDashboard} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl p-4 border border-gray-200 dark:border-gray-700 ${k.bg}`}>
            <div className={`${k.color} mb-2`}>{k.icon}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{k.value}</div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="text-sm bg-transparent focus:outline-none text-gray-900 dark:text-white" />
        </div>
        <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 flex-1 min-w-[180px]">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input type="text" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)}
            className="text-sm bg-transparent focus:outline-none text-gray-900 dark:text-white w-full" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none">
          <option value="">All Status</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="half_day">Half Day</option>
          <option value="absent">Absent</option>
          <option value="checked_out">Checked Out</option>
          <option value="not_marked">Not Marked</option>
        </select>
      </div>

      <AdminSelfAttendancePanel onRefresh={fetchDashboard} />

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            No employees match the selected filters for {date}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {['Employee Name', 'Employee ID', 'Department', 'Designation', 'Check-In', 'Check-Out', 'Status', 'Hours', 'Late', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {records.map(rec => {
                  const statusKey = rec.status ?? 'not_marked'
                  const s = statusMeta[statusKey] ?? statusMeta.absent
                  return (
                    <tr key={rec.employee_id || rec.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{rec.name}</div>
                        <div className="text-xs text-gray-400">{rec.email ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">{rec.employee_id ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{rec.department ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{rec.designation ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">{rec.check_in_time ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">{rec.check_out_time ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{rec.work_hours ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{rec.is_late ? 'Late' : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {!rec.check_in_time && (
                            <button onClick={() => runAttendanceAction(rec, 'checkin')} disabled={actionBusy === rec.employee_id}
                              className="rounded-full border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800 disabled:opacity-50">
                              Check In
                            </button>
                          )}
                          {rec.check_in_time && !rec.check_out_time && (
                            <button onClick={() => runAttendanceAction(rec, 'checkout')} disabled={actionBusy === rec.employee_id}
                              className="rounded-full border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-800 disabled:opacity-50">
                              Check Out
                            </button>
                          )}
                          <button onClick={() => runAttendanceAction(rec, 'override')} disabled={actionBusy === rec.employee_id}
                            className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50">
                            Override
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Root: role-based render ───────────────────────────────────────────────────
export default function AttendancePage() {
  const { user } = useAuthStore()
  const isAdmin = (user as any)?.role_type !== 'user'
  return isAdmin ? <AdminAttendanceDashboard /> : <UserAttendancePanel />
}
