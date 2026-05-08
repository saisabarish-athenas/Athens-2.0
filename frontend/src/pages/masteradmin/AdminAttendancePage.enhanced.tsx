import React, { useState, useEffect } from 'react'
import { adminAttendanceApi, AdminAttendanceRecord, CorrectionPayload } from '../../services/adminAttendanceApi'
import type { AttendanceDashboard } from '../../services/adminAttendanceApi'
import { apiClient } from '../../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmployeeUnderAdmin {
  id: number
  employee_code: string
  full_name: string
  department: string
  designation: string
  check_in_time: string | null
  check_out_time: string | null
  status: string
  total_hours: string
}

interface LeaveRequest {
  id: number
  employee_name: string
  employee_role: string
  leave_type_name: string
  start_date: string
  end_date: string
  days_count: number
  reason: string
  status: string
  approver_name: string | null
  can_approve: boolean
}

interface PayrollEntry {
  id: number
  employee_name: string
  employee_code: string
  department_name: string
  cycle_name: string
  gross_salary: string
  total_deductions: string
  net_salary: string
  payment_status: string
  payment_date: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  absent: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  late: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  half_day: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  working: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  checked_out: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
}

const STATUS_LABELS: Record<string, string> = {
  present: 'Present', absent: 'Absent', late: 'Late',
  half_day: 'Half Day', working: 'Working', checked_out: 'Checked Out',
}

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

// ─── Main Component ───────────────────────────────────────────────────────────
const AdminAttendancePageEnhanced: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin' | 'employee' | 'leave' | 'payroll' | 'approvals'>('dashboard')
  const [dashboard, setDashboard] = useState<AttendanceDashboard | null>(null)
  const [adminRecords, setAdminRecords] = useState<AdminAttendanceRecord[]>([])
  const [employeeRecords, setEmployeeRecords] = useState<EmployeeUnderAdmin[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAdmin, setExpandedAdmin] = useState<number | null>(null)
  const [filterDate, setFilterDate] = useState(todayStr())

  useEffect(() => {
    fetchData()
  }, [activeTab, filterDate])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'dashboard' || activeTab === 'admin') {
        const [dashRes, listRes] = await Promise.all([
          adminAttendanceApi.getDashboard(),
          adminAttendanceApi.getList({ date: filterDate }),
        ])
        setDashboard(dashRes)
        setAdminRecords(Array.isArray(listRes) ? listRes : [])
      }

      if (activeTab === 'employee') {
        const res = await apiClient.get('/api/workforce/user-attendance/dashboard/', {
          params: { date: filterDate },
        })
        setEmployeeRecords(res.data?.records || [])
      }

      if (activeTab === 'leave') {
        const res = await apiClient.get('/api/workforce/leave-requests/')
        setLeaveRequests(res.data?.data || res.data || [])
      }

      if (activeTab === 'payroll') {
        const res = await apiClient.get('/api/workforce/payroll-entries/')
        setPayrollEntries(res.data?.data || res.data || [])
      }
    } catch (e) {
      console.error('Fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleApproveLeave = async (id: number) => {
    try {
      await apiClient.post(`/api/workforce/leave-requests/${id}/approve/`)
      fetchData()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Approval failed')
    }
  }

  const handleRejectLeave = async (id: number) => {
    const reason = prompt('Rejection reason:')
    if (!reason) return
    try {
      await apiClient.post(`/api/workforce/leave-requests/${id}/reject/`, { rejection_reason: reason })
      fetchData()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Rejection failed')
    }
  }

  const handleApprovePayroll = async (id: number) => {
    try {
      await apiClient.post(`/api/workforce/payroll-entries/${id}/pay/`, { payment_mode: 'bank' })
      fetchData()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Payment failed')
    }
  }

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'admin', label: 'Admin Attendance' },
    { key: 'employee', label: 'Employee Attendance' },
    { key: 'leave', label: 'Leave Requests' },
    { key: 'payroll', label: 'Payroll Requests' },
    { key: 'approvals', label: 'Pending Approvals' },
  ] as const

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Workforce Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Centralized monitoring and approval system
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <KPI label="Total Admins" value={dashboard.total_admins} color="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" />
          <KPI label="Present" value={dashboard.present} color="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300" />
          <KPI label="Absent" value={dashboard.absent} color="bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300" />
          <KPI label="Late" value={dashboard.late} color="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300" />
          <KPI label="Half Day" value={dashboard.half_day} color="bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300" />
          <KPI label="Working" value={dashboard.working} color="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300" />
          <KPI label="Checked Out" value={dashboard.checked_out} color="bg-gray-50 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300" />
        </div>
      )}

      {/* Admin Attendance Tab */}
      {activeTab === 'admin' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white"
            />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    {['Admin Name', 'Type', 'Organization', 'Check In', 'Check Out', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {adminRecords.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{r.admin_name || '—'}</div>
                        <div className="text-xs text-gray-400">{r.admin_email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{r.admin_role || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.organization || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmt(r.check_in_time)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmt(r.check_out_time)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status || 'absent'} /></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedAdmin(expandedAdmin === r.id ? null : r.id)}
                          className="px-2 py-1 text-xs rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        >
                          {expandedAdmin === r.id ? 'Hide' : 'View'} Employees
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Employee Attendance Tab */}
      {activeTab === 'employee' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 py-2 text-gray-900 dark:text-white"
            />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    {['Employee', 'Department', 'Check In', 'Check Out', 'Hours', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {employeeRecords.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{e.full_name}</div>
                        <div className="text-xs text-gray-400">{e.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.department || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.check_in_time || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.check_out_time || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.total_hours || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Leave Requests Tab */}
      {activeTab === 'leave' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    {['Employee', 'Leave Type', 'From', 'To', 'Days', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {leaveRequests.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{l.employee_name}</div>
                        <div className="text-xs text-gray-400">{l.employee_role}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{l.leave_type_name}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{l.start_date}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{l.end_date}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{l.days_count}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          l.status === 'approved' ? 'bg-green-100 text-green-800' :
                          l.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {l.status === 'pending' && l.can_approve && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApproveLeave(l.id)}
                              className="px-2 py-1 text-xs rounded-md bg-green-50 text-green-700 hover:bg-green-100"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectLeave(l.id)}
                              className="px-2 py-1 text-xs rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payroll Requests Tab */}
      {activeTab === 'payroll' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    {['Employee', 'Cycle', 'Gross', 'Deductions', 'Net', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {payrollEntries.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{p.employee_name}</div>
                        <div className="text-xs text-gray-400">{p.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.cycle_name}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">₹{p.gross_salary}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">₹{p.total_deductions}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-semibold">₹{p.net_salary}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          p.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                          p.payment_status === 'processed' ? 'bg-blue-100 text-blue-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {p.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.payment_status === 'processed' && (
                          <button
                            onClick={() => handleApprovePayroll(p.id)}
                            className="px-2 py-1 text-xs rounded-md bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            Approve Payment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pending Approvals Tab */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold mb-4">Pending Leave Approvals</h3>
            <div className="text-sm text-gray-500">
              {leaveRequests.filter(l => l.status === 'pending' && l.can_approve).length} pending
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold mb-4">Pending Payroll Approvals</h3>
            <div className="text-sm text-gray-500">
              {payrollEntries.filter(p => p.payment_status === 'processed').length} pending
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminAttendancePageEnhanced
