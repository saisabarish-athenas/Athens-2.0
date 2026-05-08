import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, Calendar, CheckSquare, Clock, Edit2, Plus, Search, Trash2, User, X } from 'lucide-react'
import { ergonApi } from '@/services/ergonApi'
import apiClient from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'suspended'
type TaskPriority = 'low' | 'medium' | 'high'

interface Task {
  id: number
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigned_by?: number | null
  assigned_by_name?: string
  assigned_to?: number | null
  assigned_to_name?: string
  project?: number | null
  project_name?: string
  due_date?: string | null
  created_at?: string
  updated_at?: string
}

interface Project {
  id: number
  name: string
}

interface ErgonUser {
  id: number
  email: string
  name?: string
  username?: string
}

interface FormState {
  title: string
  description: string
  assigned_to: string
  due_date: string
  priority: TaskPriority
  project: string
  status: TaskStatus
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'completed') return false
  return new Date(task.due_date) < new Date()
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    assigned: 'To Do',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    suspended: 'Suspended',
  }
  return map[status] ?? status
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800'
    case 'in_progress': return 'bg-blue-100 text-blue-800'
    case 'cancelled': return 'bg-red-100 text-red-800'
    case 'suspended': return 'bg-orange-100 text-orange-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-800'
    case 'medium': return 'bg-yellow-100 text-yellow-800'
    default: return 'bg-green-100 text-green-800'
  }
}

function extractList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (Array.isArray(d.data)) return d.data
    if (Array.isArray(d.results)) return d.results
  }
  return []
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  assigned_to: '',
  due_date: '',
  priority: 'medium',
  project: '',
  status: 'assigned',
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const KPICard: React.FC<{
  title: string
  value: number
  subtitle?: string
  icon: React.ReactNode
  color?: string
  onClick?: () => void
}> = ({ title, value, subtitle, icon, color = 'text-primary', onClick }) => (
  <div
    onClick={onClick}
    className={`bg-card border border-border rounded-xl p-3 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
  >
    <div className="flex items-start justify-between mb-2">
      <div className={`p-2 rounded-lg bg-accent ${color}`}>{icon}</div>
    </div>
    <div className="text-2xl font-bold text-foreground mb-0.5">{value}</div>
    <div className="text-xs font-medium text-foreground mb-0.5">{title}</div>
    {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
  </div>
)

// ─── Task Modal ───────────────────────────────────────────────────────────────

const TaskModal: React.FC<{
  open: boolean
  title: string
  initialValues: FormState
  projects: Project[]
  users: ErgonUser[]
  loading: boolean
  onClose: () => void
  onSubmit: (values: FormState) => void
}> = ({ open, title, initialValues, projects, users, loading, onClose, onSubmit }) => {
  const [form, setForm] = useState<FormState>(initialValues)

  useEffect(() => {
    if (open) setForm(initialValues)
  }, [open, initialValues])

  if (!open) return null

  const set = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }
    if (!form.project) { toast.error('Project is required'); return }
    if (!form.due_date) { toast.error('Due date is required'); return }
    onSubmit(form)
  }

  const inputCls = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary'
  const labelCls = 'block text-sm font-medium text-foreground mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Task Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Enter task title"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Add task details"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Priority *</label>
              <select
                required
                value={form.priority}
                onChange={(e) => set('priority', e.target.value as TaskPriority)}
                className={inputCls}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Status *</label>
              <select
                required
                value={form.status}
                onChange={(e) => set('status', e.target.value as TaskStatus)}
                className={inputCls}
              >
                <option value="assigned">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Assigned User</label>
            <select
              value={form.assigned_to}
              onChange={(e) => set('assigned_to', e.target.value)}
              className={inputCls}
            >
              <option value="">— Select user —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.username || u.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Due Date *</label>
            <input
              type="date"
              required
              value={form.due_date}
              onChange={(e) => set('due_date', e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Project *</label>
            <select
              required
              value={form.project}
              onChange={(e) => set('project', e.target.value)}
              className={inputCls}
            >
              <option value="">— Select project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 text-sm font-medium"
            >
              {loading ? 'Saving…' : 'Save Task'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-accent text-foreground rounded-lg hover:bg-accent/80 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

const DeleteModal: React.FC<{
  open: boolean
  taskTitle: string
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}> = ({ open, taskTitle, loading, onConfirm, onClose }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Delete Task</h2>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete <span className="font-medium text-foreground">"{taskTitle}"</span>? This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 text-sm font-medium"
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-accent text-foreground rounded-lg hover:bg-accent/80 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TaskManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<ErgonUser[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deleteTask, setDeleteTask] = useState<Task | null>(null)

  // ── Fetch tasks ──────────────────────────────────────────────────────────────

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (searchTerm) params.search = searchTerm
      if (filterStatus !== 'all') params.status = filterStatus
      if (filterPriority !== 'all') params.priority = filterPriority
      const res = await ergonApi.getTasks(params)
      setTasks(extractList(res.data) as Task[])
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  // ── Fetch projects & users ───────────────────────────────────────────────────

  const fetchDropdowns = async () => {
    try {
      const projRes = await ergonApi.getProjects()
      setProjects(extractList(projRes.data) as Project[])
    } catch {
      // projects unavailable — form will show empty list
    }
    try {
      // Use the auth users endpoint that already exists in apiClient
      const usersRes = await apiClient.get('/api/auth/users/')
      setUsers(extractList(usersRes.data) as ErgonUser[])
    } catch {
      // users unavailable — assigned_to will be optional
    }
  }

  useEffect(() => {
    fetchDropdowns()
  }, [])

  useEffect(() => {
    fetchTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterStatus, filterPriority])

  // ── Metrics ──────────────────────────────────────────────────────────────────

  const metrics = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter((t) => t.status === 'assigned').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    highPriority: tasks.filter((t) => t.priority === 'high').length,
    overdue: tasks.filter((t) => isOverdue(t)).length,
  }), [tasks])

  // ── Create ───────────────────────────────────────────────────────────────────

  const handleCreate = async (values: FormState) => {
    setSaving(true)
    try {
      await ergonApi.createTask({
        title: values.title,
        description: values.description,
        assigned_to: values.assigned_to ? Number(values.assigned_to) : null,
        due_date: values.due_date || null,
        priority: values.priority,
        project: Number(values.project),
        status: values.status,
      })
      toast.success('Task created successfully')
      setCreateOpen(false)
      fetchTasks()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setEditOpen(true)
  }

  const handleEdit = async (values: FormState) => {
    if (!editingTask) return
    setSaving(true)
    try {
      await ergonApi.updateTask(editingTask.id, {
        title: values.title,
        description: values.description,
        assigned_to: values.assigned_to ? Number(values.assigned_to) : null,
        due_date: values.due_date || null,
        priority: values.priority,
        project: Number(values.project),
        status: values.status,
      })
      toast.success('Task updated successfully')
      setEditOpen(false)
      setEditingTask(null)
      fetchTasks()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Failed to update task')
    } finally {
      setSaving(false)
    }
  }

  // ── Quick status update ───────────────────────────────────────────────────────

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    try {
      await ergonApi.patchTask(task.id, { status: newStatus })
      toast.success(`Status updated to ${getStatusLabel(newStatus)}`)
      fetchTasks()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update status')
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTask) return
    setDeleting(true)
    try {
      await ergonApi.deleteTask(deleteTask.id)
      toast.success('Task deleted')
      setDeleteTask(null)
      fetchTasks()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete task')
    } finally {
      setDeleting(false)
    }
  }

  // ── Edit initial values ───────────────────────────────────────────────────────

  const editInitialValues: FormState = editingTask
    ? {
        title: editingTask.title,
        description: editingTask.description ?? '',
        assigned_to: editingTask.assigned_to ? String(editingTask.assigned_to) : '',
        due_date: editingTask.due_date
          ? new Date(editingTask.due_date).toISOString().slice(0, 10)
          : '',
        priority: editingTask.priority,
        project: editingTask.project ? String(editingTask.project) : '',
        status: editingTask.status,
      }
    : EMPTY_FORM

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <CheckSquare className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Task Management</h1>
          </div>
          <p className="text-muted-foreground">Create, assign, and track tasks across projects</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="Total Tasks" value={metrics.total} subtitle="All tasks" icon={<CheckSquare className="h-5 w-5" />} />
        <KPICard title="To Do" value={metrics.todo} subtitle="Not started" icon={<Clock className="h-5 w-5" />} color="text-gray-600" onClick={() => setFilterStatus('assigned')} />
        <KPICard title="In Progress" value={metrics.inProgress} subtitle="Active" icon={<Clock className="h-5 w-5" />} color="text-blue-600" onClick={() => setFilterStatus('in_progress')} />
        <KPICard title="Completed" value={metrics.completed} subtitle="Finished" icon={<CheckSquare className="h-5 w-5" />} color="text-green-600" onClick={() => setFilterStatus('completed')} />
        <KPICard title="High Priority" value={metrics.highPriority} subtitle="Urgent" icon={<AlertCircle className="h-5 w-5" />} color="text-red-600" onClick={() => setFilterPriority('high')} />
        <KPICard title="Overdue" value={metrics.overdue} subtitle="Past due" icon={<AlertCircle className="h-5 w-5" />} color="text-orange-600" />
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tasks, users, projects…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Status</option>
            <option value="assigned">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {(filterStatus !== 'all' || filterPriority !== 'all' || searchTerm) && (
            <button
              onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setSearchTerm('') }}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="bg-card border border-border rounded-xl">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <CheckSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">No tasks found. Create your first task.</p>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
            >
              <Plus className="h-4 w-4" />
              New Task
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((task) => {
              const overdue = isOverdue(task)
              return (
                <div
                  key={task.id}
                  className={`flex items-start gap-4 p-4 hover:bg-accent/40 transition-colors ${overdue ? 'border-l-4 border-l-orange-400' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-foreground text-sm truncate">{task.title}</span>
                      {overdue && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                          Overdue
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                        {getStatusLabel(task.status)}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{task.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {task.assigned_to_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {task.assigned_to_name}
                        </span>
                      )}
                      {task.due_date && (
                        <span className={`flex items-center gap-1 ${overdue ? 'text-orange-600 font-medium' : ''}`}>
                          <Calendar className="h-3 w-3" />
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                      {task.project_name && (
                        <span className="truncate max-w-[160px]">{task.project_name}</span>
                      )}
                    </div>
                  </div>

                  {/* Quick status change */}
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                      className="text-xs px-2 py-1 bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      title="Change status"
                    >
                      <option value="assigned">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="suspended">Suspended</option>
                    </select>
                    <button
                      onClick={() => openEdit(task)}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="Edit task"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTask(task)}
                      className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                      title="Delete task"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <TaskModal
        open={createOpen}
        title="Create New Task"
        initialValues={EMPTY_FORM}
        projects={projects}
        users={users}
        loading={saving}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      {/* Edit Modal */}
      <TaskModal
        open={editOpen}
        title="Edit Task"
        initialValues={editInitialValues}
        projects={projects}
        users={users}
        loading={saving}
        onClose={() => { setEditOpen(false); setEditingTask(null) }}
        onSubmit={handleEdit}
      />

      {/* Delete Confirm */}
      <DeleteModal
        open={!!deleteTask}
        taskTitle={deleteTask?.title ?? ''}
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTask(null)}
      />
    </div>
  )
}
