import { apiClient } from '../lib/api'

export interface AttendanceDashboard {
  date: string
  total_admins: number
  present: number
  absent: number
  late: number
  half_day: number
  working: number
  checked_out: number
}

export interface AdminAttendanceRecord {
  id: number
  admin: number
  admin_email: string
  admin_name: string
  admin_role: string
  organization: string
  project_name: string
  attendance_date: string
  check_in_time: string | null
  check_out_time: string | null
  total_hours: string
  status: 'present' | 'absent' | 'late' | 'half_day' | 'working' | 'checked_out'
  check_in_location: { lat: number; lng: number } | null
  check_out_location: { lat: number; lng: number } | null
  is_manual: boolean
  correction_note: string
  corrected_by: number | null
  corrected_at: string | null
}

export interface ManualAttendancePayload {
  admin_id: number
  attendance_date: string
  check_in_time?: string
  check_out_time?: string
  status?: string
  correction_note?: string
}

export interface CorrectionPayload {
  check_in_time?: string
  check_out_time?: string
  status?: string
  correction_note?: string
}

const BASE = '/api/admin-attendance'

const EMPTY_DASHBOARD: AttendanceDashboard = {
  date: new Date().toISOString().slice(0, 10),
  total_admins: 0,
  present: 0,
  absent: 0,
  late: 0,
  half_day: 0,
  working: 0,
  checked_out: 0,
}

function normalizeArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).results)) {
    return (data as Record<string, unknown>).results as T[]
  }
  return []
}

export const adminAttendanceApi = {
  getDashboard: async (): Promise<AttendanceDashboard> => {
    const r = await apiClient.get(`${BASE}/dashboard/`)
    return r.data && typeof r.data === 'object' ? r.data : EMPTY_DASHBOARD
  },

  getList: async (params: {
    date?: string
    status?: string
    admin_type?: string
    search?: string
  }): Promise<AdminAttendanceRecord[]> => {
    const r = await apiClient.get(`${BASE}/`, { params })
    return normalizeArray<AdminAttendanceRecord>(r.data)
  },

  markManual: async (payload: ManualAttendancePayload): Promise<AdminAttendanceRecord> => {
    const r = await apiClient.post(`${BASE}/manual/`, payload)
    return r.data
  },

  correct: async (id: number, payload: CorrectionPayload): Promise<AdminAttendanceRecord> => {
    const r = await apiClient.patch(`${BASE}/${id}/correct/`, payload)
    return r.data
  },

  forceCheckout: async (id: number, note?: string): Promise<AdminAttendanceRecord> => {
    const r = await apiClient.post(`${BASE}/${id}/force-checkout/`, { correction_note: note })
    return r.data
  },

  getExportUrl: (dateFrom: string, dateTo: string): string =>
    `${BASE}/export/?date_from=${dateFrom}&date_to=${dateTo}`,
}
