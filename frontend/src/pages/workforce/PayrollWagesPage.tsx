'use client'
import { useState, useEffect, useCallback } from 'react'
import { DollarSign, Search, TrendingUp, TrendingDown, Calendar, CheckCircle, Clock, Download, Eye, Loader2, AlertCircle, X } from 'lucide-react'
import { apiClient } from '../../lib/api'
import toast from 'react-hot-toast'

interface KPICardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  trend?: { value: number; isUp: boolean }
  color?: string
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, icon, trend, color = 'text-primary' }) => (
  <div className={`bg-card border border-border rounded-xl p-3`}>
    <div className="flex items-start justify-between mb-2">
      <div className={`p-2 rounded-lg bg-accent ${color}`}>{icon}</div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs ${trend.isUp ? 'text-green-600' : 'text-red-600'}`}>
          {trend.isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(trend.value)}%
        </div>
      )}
    </div>
    <div className="text-2xl font-bold text-foreground mb-0.5">{value}</div>
    <div className="text-xs font-medium text-foreground mb-0.5">{title}</div>
    {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
  </div>
)

interface PayrollEntry {
  id: number
  employee: { id: number; full_name: string; employee_code: string; department?: { name: string }; designation?: { name: string } }
  payroll_cycle: { id: number; cycle_name: string; period_from: string; period_to: string }
  basic_earned: number
  da_earned: number
  hra_earned: number
  other_allowances: number
  overtime_wages: number
  gross_salary: number
  pf_employee: number
  esi_employee: number
  professional_tax: number
  fines: number
  advances: number
  other_deductions: number
  total_deductions: number
  net_salary: number
  payment_status: 'pending' | 'processed' | 'paid'
  payment_date?: string
  total_days_worked: number
  overtime_hours: number
}

interface PayslipData {
  id: number
  employee_name: string
  employee_id: string
  department: string
  designation: string
  payroll_month: string
  period_from: string
  period_to: string
  earnings: { basic_salary: number; da: number; hra: number; allowances: number; overtime_wages: number; gross_salary: number }
  deductions: { pf: number; esi: number; professional_tax: number; fines: number; advances: number; other_deductions: number; total_deductions: number }
  net_salary: number
  payment_status: string
  payment_date?: string
  payment_mode?: string
  total_days_worked: number
  overtime_hours: number
}

function PayslipModal({ entry, isOpen, onClose }: { entry: PayslipData | null; isOpen: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && entry) {
      setLoading(false)
    }
  }, [isOpen, entry])

  if (!isOpen || !entry) return null

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    const element = document.getElementById('payslip-content')
    if (!element) return
    const html = element.innerHTML
    const doc = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(doc)
    const link = document.createElement('a')
    link.href = url
    link.download = `Payslip_${entry.employee_id}_${entry.payroll_month}.html`
    link.click()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full my-8 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-border bg-card">
          <h2 className="text-2xl font-bold text-foreground">Payslip</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="px-3 py-2 border border-border rounded-lg hover:bg-accent text-sm flex items-center gap-2">
              <Download className="h-4 w-4" /> Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div id="payslip-content" className="p-8 space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{entry.employee_name}</h1>
              <p className="text-muted-foreground text-sm">{entry.employee_id}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Department</p>
              <p className="font-medium text-foreground">{entry.department}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Designation</p>
              <p className="font-medium text-foreground">{entry.designation}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Payroll Month</p>
              <p className="font-medium text-foreground">{entry.payroll_month}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Days Worked</p>
              <p className="font-medium text-foreground">{entry.total_days_worked}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 py-4">
            <div>
              <h3 className="font-bold text-foreground mb-3 text-lg">Earnings</h3>
              <table className="w-full text-sm">
                <tbody className="space-y-2">
                  <tr className="flex justify-between"><td>Basic Salary:</td><td className="font-medium">₹{entry.earnings.basic_salary.toFixed(2)}</td></tr>
                  <tr className="flex justify-between"><td>DA:</td><td className="font-medium">₹{entry.earnings.da.toFixed(2)}</td></tr>
                  <tr className="flex justify-between"><td>HRA:</td><td className="font-medium">₹{entry.earnings.hra.toFixed(2)}</td></tr>
                  <tr className="flex justify-between"><td>Other Allowances:</td><td className="font-medium">₹{entry.earnings.allowances.toFixed(2)}</td></tr>
                  <tr className="flex justify-between"><td>OT Wages:</td><td className="font-medium">₹{entry.earnings.overtime_wages.toFixed(2)}</td></tr>
                  <tr className="flex justify-between border-t pt-2 font-bold"><td>Gross Salary:</td><td>₹{entry.earnings.gross_salary.toFixed(2)}</td></tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="font-bold text-foreground mb-3 text-lg">Deductions</h3>
              <table className="w-full text-sm">
                <tbody className="space-y-2">
                  <tr className="flex justify-between"><td>PF:</td><td className="font-medium">₹{entry.deductions.pf.toFixed(2)}</td></tr>
                  <tr className="flex justify-between"><td>ESI:</td><td className="font-medium">₹{entry.deductions.esi.toFixed(2)}</td></tr>
                  <tr className="flex justify-between"><td>Professional Tax:</td><td className="font-medium">₹{entry.deductions.professional_tax.toFixed(2)}</td></tr>
                  <tr className="flex justify-between"><td>Fines:</td><td className="font-medium">₹{entry.deductions.fines.toFixed(2)}</td></tr>
                  <tr className="flex justify-between"><td>Advances:</td><td className="font-medium">₹{entry.deductions.advances.toFixed(2)}</td></tr>
                  <tr className="flex justify-between"><td>Other Deductions:</td><td className="font-medium">₹{entry.deductions.other_deductions.toFixed(2)}</td></tr>
                  <tr className="flex justify-between border-t pt-2 font-bold text-red-600"><td>Total Deductions:</td><td>₹{entry.deductions.total_deductions.toFixed(2)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            <div className="text-right">
              <p className="text-sm text-muted-foreground mb-1">Net Salary</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">₹{entry.net_salary.toFixed(2)}</p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground text-center">
            <p>Status: <span className="font-semibold">{entry.payment_status.toUpperCase()}</span></p>
            {entry.payment_date && <p>Payment Date: {entry.payment_date}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PayrollWagesPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [payrollData, setPayrollData] = useState<PayrollEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({ totalPayroll: 0, processed: 0, pending: 0, paid: 0 })
  const [actionBusy, setActionBusy] = useState<number | null>(null)
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(null)
  const [payslipModalOpen, setPayslipModalOpen] = useState(false)

  const fetchPayrollData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ cycle: selectedMonth })
      if (filterStatus !== 'all') params.set('payment_status', filterStatus)
      if (searchTerm) params.set('search', searchTerm)

      const response = await apiClient.get(`/api/workforce/payroll-entries/?${params}`)
      const entries = Array.isArray(response.data) ? response.data : response.data?.results || []
      
      setPayrollData(entries)

      // Calculate metrics
      const total = entries.reduce((sum, e) => sum + e.net_salary, 0)
      const proc = entries.filter(e => e.payment_status === 'processed' || e.payment_status === 'paid').length
      const pend = entries.filter(e => e.payment_status === 'pending').length
      const paid = entries.filter(e => e.payment_status === 'paid').length

      setMetrics({ totalPayroll: total, processed: proc, pending: pend, paid })
    } catch (error: any) {
      console.error('Failed to fetch payroll:', error)
      toast.error(error?.response?.data?.message || 'Failed to load payroll data')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, filterStatus, searchTerm])

  useEffect(() => {
    const timer = setTimeout(fetchPayrollData, 300)
    return () => clearTimeout(timer)
  }, [fetchPayrollData])

  const handleProcess = async (entry: PayrollEntry) => {
    setActionBusy(entry.id)
    try {
      await apiClient.post(`/api/workforce/payroll-entries/${entry.id}/process_single/`)
      toast.success(`✓ Payroll processed for ${entry.employee.full_name}`)
      fetchPayrollData()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to process payroll')
    } finally {
      setActionBusy(null)
    }
  }

  const handlePay = async (entry: PayrollEntry) => {
    setActionBusy(entry.id)
    try {
      await apiClient.post(`/api/workforce/payroll-entries/${entry.id}/pay/`, {
        payment_mode: 'bank',
      })
      toast.success(`✓ Payment marked for ${entry.employee.full_name}`)
      fetchPayrollData()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to mark payment')
    } finally {
      setActionBusy(null)
    }
  }

  const handleViewPayslip = async (entry: PayrollEntry) => {
    setActionBusy(entry.id)
    try {
      const response = await apiClient.get(`/api/workforce/payroll-entries/${entry.id}/payslip/`)
      setSelectedPayslip(response.data)
      setPayslipModalOpen(true)
    } catch (error: any) {
      toast.error('Failed to load payslip')
    } finally {
      setActionBusy(null)
    }
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ cycle: selectedMonth })
      if (filterStatus !== 'all') params.set('payment_status', filterStatus)
      
      const response = await apiClient.get(`/api/workforce/payroll-entries/export/?${params}`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(response)
      const link = document.createElement('a')
      link.href = url
      link.download = `payroll_${selectedMonth}.csv`
      link.click()
      toast.success('✓ Payroll exported successfully')
    } catch (error: any) {
      toast.error('Failed to export payroll')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      case 'processed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Payroll & Wages</h1>
          </div>
          <p className="text-muted-foreground">Manage employee salaries and wage processing</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Payroll" value={`₹${(metrics.totalPayroll / 100000).toFixed(1)}L`} subtitle="This month" icon={<DollarSign className="h-5 w-5" />} color="text-green-600" />
        <KPICard title="Processed" value={metrics.processed} subtitle="Ready to pay" icon={<CheckCircle className="h-5 w-5" />} color="text-blue-600" />
        <KPICard title="Pending" value={metrics.pending} subtitle="To process" icon={<Clock className="h-5 w-5" />} color="text-yellow-600" />
        <KPICard title="Paid" value={metrics.paid} subtitle="Completed" icon={<CheckCircle className="h-5 w-5" />} color="text-green-600" />
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-4 flex-wrap mb-6">
          <div className="flex-1 relative min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="processed">Processed</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {loading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && payrollData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2" />
            <p>No payroll entries found for the selected criteria</p>
          </div>
        )}

        {!loading && payrollData.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-accent">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Emp ID</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Name</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Basic</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Allowances</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Deductions</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Net Salary</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Status</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payrollData.map(entry => (
                  <tr key={entry.id} className="hover:bg-accent/50">
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{entry.employee.employee_code}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{entry.employee.full_name}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">₹{entry.basic_earned.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right text-green-600">+₹{(entry.da_earned + entry.hra_earned + entry.other_allowances).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-600">-₹{entry.total_deductions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-foreground">₹{entry.net_salary.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(entry.payment_status)}`}>
                        {entry.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        {entry.payment_status === 'pending' && (
                          <button
                            onClick={() => handleProcess(entry)}
                            disabled={actionBusy === entry.id}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {actionBusy === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '⚡'}
                            Process
                          </button>
                        )}
                        {entry.payment_status === 'processed' && (
                          <button
                            onClick={() => handlePay(entry)}
                            disabled={actionBusy === entry.id}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {actionBusy === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '✓'}
                            Pay
                          </button>
                        )}
                        <button
                          onClick={() => handleViewPayslip(entry)}
                          disabled={actionBusy === entry.id}
                          className="px-3 py-1 bg-accent text-foreground rounded text-xs hover:bg-accent/80 disabled:opacity-50 flex items-center gap-1"
                        >
                          {actionBusy === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          Slip
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-accent border-t-2 border-primary">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right text-sm font-bold text-foreground">
                    Total:
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-lg text-foreground">
                    ₹{metrics.totalPayroll.toLocaleString()}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <PayslipModal entry={selectedPayslip} isOpen={payslipModalOpen} onClose={() => setPayslipModalOpen(false)} />
    </div>
  )
}
