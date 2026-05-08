import { useState, useEffect } from 'react'
import { Plus, Search, Users, Briefcase, TrendingUp, TrendingDown, Building, Award, X, Eye, Pencil, Trash2, CheckCircle, XCircle, Clock, Copy } from 'lucide-react'
import { apiClient } from '../../lib/api'
import { profileManagementApi, type ManagedUser } from '../../services/profileManagementApi'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: number
  employee_code: string
  full_name: string
  department: number | null
  department_name: string | null
  designation: number | null
  designation_name: string | null
  employment_type: string
  wage_type: string
  joining_date: string
  status: string
  basic_structure: string
  contact_number: string
  gender: string
}

interface FormData {
  employee_code: string
  full_name: string
  gender: string
  date_of_birth: string
  permanent_address: string
  contact_number: string
  email: string
  employment_type: string
  wage_type: string
  joining_date: string
  basic_structure: string
}

const EMPTY_FORM: FormData = {
  employee_code: '',
  full_name: '',
  gender: 'M',
  date_of_birth: '',
  permanent_address: '',
  contact_number: '',
  email: '',
  employment_type: 'permanent',
  wage_type: 'monthly',
  joining_date: '',
  basic_structure: '0',
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  trend?: { value: number; isUp: boolean }
  color?: string
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, icon, trend, color = 'text-primary' }) => (
  <div className="bg-card border border-border rounded-xl p-3">
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

// ─── View Employee Modal ─────────────────────────────────────────────────────

interface ViewEmployeeModalProps {
  emp: Employee
  onClose: () => void
}

const ViewEmployeeModal: React.FC<ViewEmployeeModalProps> = ({ emp, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
    <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Employee Details</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-5 space-y-3">
        {([
          ['Employee Code', emp.employee_code],
          ['Full Name',     emp.full_name],
          ['Gender',        emp.gender === 'M' ? 'Male' : emp.gender === 'F' ? 'Female' : 'Other'],
          ['Contact',       emp.contact_number],
          ['Department',    emp.department_name || '—'],
          ['Designation',   emp.designation_name || '—'],
          ['Employment',    emp.employment_type],
          ['Wage Type',     emp.wage_type],
          ['Joining Date',  emp.joining_date],
          ['Basic Salary',  `₹${Number(emp.basic_structure).toLocaleString()}`],
          ['Status',        emp.status],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-muted-foreground w-36 shrink-0">{label}</span>
            <span className="text-foreground font-medium text-right">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-end p-5 border-t border-border">
        <button onClick={onClose}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90">
          Close
        </button>
      </div>
    </div>
  </div>
)

// ─── Add Employee Modal ───────────────────────────────────────────────────────

interface AddEmployeeModalProps {
  onClose: () => void
  onSaved: () => void
}

interface CreatedCreds { email: string; username: string; password: string }

const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({ onClose, onSaved }) => {
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdCreds, setCreatedCreds] = useState<CreatedCreds | null>(null)

  const set = (field: keyof FormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await apiClient.post('/api/workforce/employees/', {
        employee_code: form.employee_code,
        full_name: form.full_name,
        gender: form.gender,
        date_of_birth: form.date_of_birth || null,
        permanent_address: form.permanent_address,
        contact_number: form.contact_number,
        employment_type: form.employment_type,
        wage_type: form.wage_type,
        joining_date: form.joining_date || null,
        basic_structure: form.basic_structure || '0',
        email: form.email,
        // username auto-generated by backend from email prefix
        // password auto-generated by backend
      })
      const login = res.data?.login
      if (login) {
        setCreatedCreds({ email: login.email, username: login.username, password: login.password })
      }
      onSaved()
    } catch (err: any) {
      const data = err?.response?.data
      if (err?.response?.status === 403) {
        setError(data?.detail || data?.error || 'You do not have permission to add employees.')
      } else if (data && typeof data === 'object' && !data.detail && !data.error && !data.message) {
        setError(Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | '))
      } else {
        setError(data?.error || data?.detail || data?.message || 'Failed to create employee.')
      }
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof FormData, type = 'text', required = true) => (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">{label}{required && ' *'}</label>
      <input
        type={type}
        required={required}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  )

  if (createdCreds) {
    const downloadCredentials = () => {
      const text = [
        'EMPLOYEE LOGIN CREDENTIALS',
        '===========================',
        `Name     : ${form.full_name}`,
        `Email    : ${createdCreds.email}`,
        `Username : ${createdCreds.username}`,
        `Password : ${createdCreds.password}`,
        '',
        'IMPORTANT: Change password on first login.',
        `Generated : ${new Date().toLocaleString()}`,
      ].join('\n')
      const blob = new Blob([text], { type: 'text/plain' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `credentials_${form.full_name.replace(/\s+/g, '_').toLowerCase()}.txt`
      a.click()
      URL.revokeObjectURL(a.href)
    }

    const copyField = (value: string, label: string) => {
      navigator.clipboard?.writeText(value)
      toast.success(`${label} copied!`)
    }

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
        <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-green-600 px-6 py-4 flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-white" />
            <div>
              <h2 className="text-base font-bold text-white">User Created Successfully</h2>
              <p className="text-xs text-green-100">{form.full_name} &bull; {form.employee_code}</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Security warning */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
              <span className="text-amber-500 text-base mt-0.5">&#9888;</span>
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Password is shown only once. Save or download it now before closing.
              </p>
            </div>

            {/* Credential rows */}
            {([
              ['Email',    createdCreds.email],
              ['Username', createdCreds.username],
              ['Password', createdCreds.password],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-accent rounded-lg text-sm font-mono text-foreground break-all">
                    {value}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyField(value, label)}
                    className="shrink-0 px-3 py-2 border border-border rounded-lg text-xs hover:bg-accent transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={downloadCredentials}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent transition-colors"
              >
                &#8595; Download .txt
              </button>
              <button
                type="button"
                onClick={() => {
                  copyField(
                    `Email: ${createdCreds.email}\nUsername: ${createdCreds.username}\nPassword: ${createdCreds.password}`,
                    'All credentials'
                  )
                }}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent transition-colors"
              >
                <Copy className="h-3.5 w-3.5" /> Copy All
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Add Employee</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {field('Employee Code', 'employee_code')}
            {field('Full Name', 'full_name')}
            {field('Contact Number', 'contact_number')}
            {field('Email', 'email', 'email')}
            {field('Date of Birth', 'date_of_birth', 'date', false)}
            {field('Joining Date', 'joining_date', 'date', false)}
            {field('Basic Salary (₹)', 'basic_structure', 'number', false)}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Permanent Address *</label>
            <textarea
              required
              value={form.permanent_address}
              onChange={e => set('permanent_address', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Gender *</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Employment Type *</label>
              <select value={form.employment_type} onChange={e => set('employment_type', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="permanent">Permanent</option>
                <option value="contract">Contract</option>
                <option value="temporary">Temporary</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Wage Type *</label>
              <select value={form.wage_type} onChange={e => set('wage_type', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Creating...' : 'Add Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Employee Modal ─────────────────────────────────────────────────────

interface EditEmployeeModalProps {
  emp: Employee
  onClose: () => void
  onUpdated: (emp: Employee) => void
}

const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({ emp, onClose, onUpdated }) => {
  const [form, setForm] = useState<FormData>({
    employee_code:     emp.employee_code,
    full_name:         emp.full_name,
    gender:            emp.gender,
    date_of_birth:     '',
    permanent_address: '',
    contact_number:    emp.contact_number,
    email:             '',
    employment_type:   emp.employment_type,
    wage_type:         emp.wage_type,
    joining_date:      emp.joining_date,
    basic_structure:   emp.basic_structure,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const set = (field: keyof FormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await apiClient.patch(`/api/workforce/employees/${emp.id}/`, form)
      const updated: Employee = res.data?.data ?? res.data
      onUpdated(updated)
    } catch (err: any) {
      const data = err?.response?.data
      if (err?.response?.status === 403) {
        setError('You do not have permission to edit employees.')
      } else if (data && typeof data === 'object' && !data.detail && !data.error) {
        setError(Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | '))
      } else {
        setError(data?.detail || data?.error || 'Failed to update employee.')
      }
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof FormData, type = 'text', required = false) => (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">{label}{required && ' *'}</label>
      <input type={type} required={required} value={form[key]}
        onChange={e => set(key, e.target.value)}
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Edit Employee — {emp.full_name}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            {field('Employee Code',   'employee_code',   'text',   true)}
            {field('Full Name',        'full_name',        'text',   true)}
            {field('Contact Number',   'contact_number')}
            {field('Date of Birth',    'date_of_birth',   'date')}
            {field('Joining Date',     'joining_date',    'date')}
            {field('Basic Salary (₹)', 'basic_structure', 'number')}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Permanent Address</label>
            <textarea value={form.permanent_address} onChange={e => set('permanent_address', e.target.value)}
              rows={2} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Gender</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Employment Type</label>
              <select value={form.employment_type} onChange={e => set('employment_type', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="permanent">Permanent</option><option value="contract">Contract</option><option value="temporary">Temporary</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Wage Type</label>
              <select value={form.wage_type} onChange={e => set('wage_type', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="monthly">Monthly</option><option value="daily">Daily</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Update Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeeManagementPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [pendingUsers, setPendingUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [approvingId, setApprovingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [activeTab, setActiveTab] = useState<'employees' | 'approvals'>('employees')

  const fetchEmployees = () => {
    setLoading(true)
    Promise.all([
      apiClient.get('/api/workforce/employees/'),
      profileManagementApi.listPendingApprovals().catch(() => ({ data: [] })),
    ])
      .then(([empRes, pendingRes]) => {
        const list: Employee[] = Array.isArray(empRes.data?.data)
          ? empRes.data.data
          : Array.isArray(empRes.data) ? empRes.data : []
        setEmployees(list)
        setPendingUsers(Array.isArray(pendingRes.data) ? pendingRes.data as ManagedUser[] : [])
      })
      .catch(err => {
        const data = err?.response?.data
        if (err?.response?.status === 403) {
          setError(data?.detail || data?.error || 'You do not have permission to access Workforce.')
        } else {
          setError(data?.detail || data?.error || 'Failed to load employees.')
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchEmployees() }, [])

  const handleSaved = () => {
    // Don't close modal immediately — AddEmployeeModal shows credentials popup first.
    // Modal closes itself when user clicks Done.
    fetchEmployees()
  }

  const handleUpdated = (updated: Employee) => {
    setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e))
    setEditEmployee(null)
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this employee? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await apiClient.delete(`/api/workforce/employees/${id}/`)
      setEmployees(prev => prev.filter(e => e.id !== id))
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to delete.')
    } finally { setDeletingId(null) }
  }

  const handleApprove = async (userId: number) => {
    setApprovingId(userId)
    try {
      await profileManagementApi.approveUser(userId)
      toast.success('Employee approved — they can now access the system.')
      fetchEmployees()
    } catch { toast.error('Failed to approve.') }
    finally { setApprovingId(null) }
  }

  const handleReject = async (userId: number) => {
    try {
      await profileManagementApi.rejectUser(userId)
      toast.success('Employee rejected.')
      fetchEmployees()
    } catch { toast.error('Failed to reject.') }
  }

  const filtered = employees.filter(e => {
    const matchSearch = e.full_name.toLowerCase().includes(searchTerm.toLowerCase())
      || e.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = filterType === 'all' || e.employment_type === filterType
    return matchSearch && matchType
  })

  const metrics = {
    total: employees.length,
    permanent: employees.filter(e => e.employment_type === 'permanent').length,
    contract: employees.filter(e => e.employment_type === 'contract').length,
    pending: pendingUsers.length,
  }

  return (
    <div className="p-6 space-y-6">
      {showModal    && <AddEmployeeModal onClose={() => setShowModal(false)} onSaved={handleSaved} />}
      {viewEmployee && <ViewEmployeeModal emp={viewEmployee} onClose={() => setViewEmployee(null)} />}
      {editEmployee && <EditEmployeeModal emp={editEmployee} onClose={() => setEditEmployee(null)} onUpdated={handleUpdated} />}

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Users className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Employee Management</h1>
          </div>
          <p className="text-muted-foreground">Manage employees and approve onboarding requests</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Employee
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Employees" value={metrics.total} subtitle="All employees" icon={<Users className="h-5 w-5" />} />
        <KPICard title="Permanent" value={metrics.permanent} subtitle="Full-time" icon={<Briefcase className="h-5 w-5" />} color="text-green-600" />
        <KPICard title="Contract" value={metrics.contract} subtitle="Temporary" icon={<Award className="h-5 w-5" />} color="text-blue-600" />
        <KPICard title="Pending Approval" value={metrics.pending} subtitle="Awaiting review" icon={<Clock className="h-5 w-5" />} color="text-amber-600" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['employees', 'approvals'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {tab === 'approvals'
              ? `Pending Approvals${pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ''}`
              : 'Employees'}
          </button>
        ))}
      </div>

      {activeTab === 'approvals' ? (
        <div className="bg-card border border-border rounded-xl p-6">
          {pendingUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No pending approvals.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-accent">
                  <tr>
                    {['Username', 'Name', 'Department', 'Designation', 'Company Type', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-sm font-semibold text-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendingUsers.map(u => (
                    <tr key={u.id} className="hover:bg-accent/50">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{u.username}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{u.name} {u.surname}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{u.department || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{u.designation || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          u.company_type === 'epc' ? 'bg-green-100 text-green-800' :
                          u.company_type === 'client' ? 'bg-blue-100 text-blue-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>{u.company_type?.toUpperCase() || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(u.id)} disabled={approvingId === u.id}
                            className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                            <CheckCircle className="h-3 w-3" /> Approve
                          </button>
                          <button onClick={() => handleReject(u.id)}
                            className="flex items-center gap-1 px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg">
                            <XCircle className="h-3 w-3" /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-4 flex-wrap mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input type="text" placeholder="Search by name or employee code..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="all">All Types</option>
              <option value="permanent">Permanent</option>
              <option value="contract">Contract</option>
              <option value="temporary">Temporary</option>
            </select>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading employees...</div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {employees.length === 0 ? 'No employees yet. Click "Add Employee" to get started.' : 'No employees match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-accent">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Emp Code</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Department</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Designation</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Type</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Basic Salary</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Joining Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(emp => (
                    <tr key={emp.id} className="hover:bg-accent/50">
                      <td className="px-4 py-3 text-sm font-mono text-foreground">{emp.employee_code}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{emp.full_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{emp.department_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{emp.designation_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          emp.employment_type === 'permanent' ? 'bg-green-100 text-green-800' :
                          emp.employment_type === 'contract'  ? 'bg-blue-100 text-blue-800' :
                                                                'bg-yellow-100 text-yellow-800'
                        }`}>
                          {emp.employment_type.charAt(0).toUpperCase() + emp.employment_type.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                        ₹{Number(emp.basic_structure).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{emp.joining_date}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          emp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>{emp.status}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewEmployee(emp)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-xs">
                            <Eye className="h-3 w-3" />View
                          </button>
                          <button onClick={() => setEditEmployee(emp)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 text-xs">
                            <Pencil className="h-3 w-3" />Edit
                          </button>
                          <button onClick={() => handleDelete(emp.id)} disabled={deletingId === emp.id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs disabled:opacity-50">
                            <Trash2 className="h-3 w-3" />{deletingId === emp.id ? '...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
