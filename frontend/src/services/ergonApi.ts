import { apiClient } from '../lib/api'

export const ergonApi = {
  // Daily Planner
  getDailyTasks: (date: string) => apiClient.get('/api/ergon/daily-planner/', { params: { date } }),
  createDailyTask: (data: any) => apiClient.post('/api/ergon/daily-planner/', data),
  startTask: (id: string) => apiClient.post(`/api/ergon/daily-planner/${id}/start_task/`),
  pauseTask: (id: string) => apiClient.post(`/api/ergon/daily-planner/${id}/pause_task/`),
  resumeTask: (id: string) => apiClient.post(`/api/ergon/daily-planner/${id}/resume_task/`),
  completeTask: (id: string, data: any) => apiClient.post(`/api/ergon/daily-planner/${id}/complete_task/`, data),
  postponeTask: (id: string, data: any) => apiClient.post(`/api/ergon/daily-planner/${id}/postpone_task/`, data),
  rolloverTasks: () => apiClient.post('/api/ergon/daily-planner/rollover/'),
  getDailyTaskHistory: (id: string) => apiClient.get(`/api/ergon/daily-planner/${id}/history/`),
  getSLAHistory: (id: string) => apiClient.get(`/api/ergon/daily-planner/${id}/sla_history/`),

  // Tasks
  getTasks: (params?: any) => apiClient.get('/api/ergon/tasks/', { params }),
  createTask: (data: any) => apiClient.post('/api/ergon/tasks/', data),
  updateTask: (id: string | number, data: any) => apiClient.put(`/api/ergon/tasks/${id}/`, data),
  patchTask: (id: string | number, data: any) => apiClient.patch(`/api/ergon/tasks/${id}/`, data),
  deleteTask: (id: string | number) => apiClient.delete(`/api/ergon/tasks/${id}/`),
  updateProgress: (id: string, data: any) => apiClient.post(`/api/ergon/tasks/${id}/update_progress/`, data),
  getTaskHistory: (id: string) => apiClient.get(`/api/ergon/tasks/${id}/history/`),

  // Follow-ups
  getFollowups: () => apiClient.get('/api/ergon/followups/'),
  createFollowup: (data: any) => apiClient.post('/api/ergon/followups/', data),
  completeFollowup: (id: string) => apiClient.post(`/api/ergon/followups/${id}/complete/`),
  cancelFollowup: (id: string, data: any) => apiClient.post(`/api/ergon/followups/${id}/cancel/`, data),
  rescheduleFollowup: (id: string, data: any) => apiClient.post(`/api/ergon/followups/${id}/reschedule/`, data),
  getFollowupReminders: () => apiClient.get('/api/ergon/followups/reminders/'),
  getFollowupHistory: (id: string) => apiClient.get(`/api/ergon/followups/${id}/history/`),

  // Projects
  getProjects: () => apiClient.get('/api/ergon/projects/'),
  createProject: (data: any) => apiClient.post('/api/ergon/projects/', data),

  // Departments & Categories
  getDepartments: (projectId?: string) => apiClient.get('/api/ergon/departments/', { params: { project_id: projectId } }),
  getTaskCategories: (departmentId?: string) => apiClient.get('/api/ergon/task-categories/', { params: { department_id: departmentId } }),

  // Contacts
  getContacts: () => apiClient.get('/api/ergon/contacts/'),
  createContact: (data: any) => apiClient.post('/api/ergon/contacts/', data),

  // Manpower & Machinery
  getManpower: () => apiClient.get('/api/ergon/manpower/'),
  getMachinery: () => apiClient.get('/api/ergon/machinery/'),

  // Advances & Expenses
  getAdvances: () => apiClient.get('/api/ergon/advances/'),
  getExpenses: () => apiClient.get('/api/ergon/expenses/'),

  // Ledger
  getLedgerEntries: () => apiClient.get('/api/ergon/ledger/'),

  // Customers & Invoices
  getCustomers: () => apiClient.get('/api/ergon/customers/'),
  getInvoices: () => apiClient.get('/api/ergon/invoices/'),
}
