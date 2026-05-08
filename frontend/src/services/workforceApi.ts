import { apiClient } from '../lib/api'

export const workforceApi = {
  getProjects: () => apiClient.get('/api/workforce/projects/'),
  createProject: (data: any) => apiClient.post('/api/workforce/projects/', data),
  updateProject: (id: string, data: any) => apiClient.put(`/api/workforce/projects/${id}/`, data),
  deleteProject: (id: string) => apiClient.delete(`/api/workforce/projects/${id}/`),
  getProjectMembers: (id: string) => apiClient.get(`/api/workforce/projects/${id}/members/`),
  addProjectMember: (id: string, data: any) => apiClient.post(`/api/workforce/projects/${id}/members/`, data),
  
  getTasks: (projectId?: string) => apiClient.get('/api/workforce/tasks/', { params: { project_id: projectId } }),
  createTask: (data: any) => apiClient.post('/api/workforce/tasks/', data),
  updateTask: (id: string, data: any) => apiClient.put(`/api/workforce/tasks/${id}/`, data),
  moveTask: (id: string, data: any) => apiClient.patch(`/api/workforce/tasks/${id}/move/`, data),
  getTaskComments: (id: string) => apiClient.get(`/api/workforce/tasks/${id}/comments/`),
  addTaskComment: (id: string, data: any) => apiClient.post(`/api/workforce/tasks/${id}/comments/`, data),
  
  getCustomers: () => apiClient.get('/api/workforce/customers/'),
  createCustomer: (data: any) => apiClient.post('/api/workforce/customers/', data),
  
  // Attendance (self)
  getTodayAttendance: () => apiClient.get('/api/workforce/attendance/today/'),
  checkIn: (data: { date: string; check_in_time: string; latitude: number; longitude: number; status: string }) =>
    apiClient.post('/api/workforce/attendance/', data),
  checkOut: (id: number, data: { check_out_time: string; latitude: number; longitude: number }) =>
    apiClient.patch(`/api/workforce/attendance/${id}/checkout/`, data),

  // Payroll Cycles
  getPayrollCycles: (params?: any) => apiClient.get('/api/workforce/payroll-cycles/', { params }),
  createPayrollCycle: (data: any) => apiClient.post('/api/workforce/payroll-cycles/', data),
  updatePayrollCycle: (id: number, data: any) => apiClient.patch(`/api/workforce/payroll-cycles/${id}/`, data),
  deletePayrollCycle: (id: number) => apiClient.delete(`/api/workforce/payroll-cycles/${id}/`),
  processPayrollCycle: (id: number) => apiClient.post(`/api/workforce/payroll-cycles/${id}/process/`),
  lockPayrollCycle: (id: number) => apiClient.post(`/api/workforce/payroll-cycles/${id}/lock/`),
  payAllEntries: (id: number, data?: any) => apiClient.post(`/api/workforce/payroll-cycles/${id}/pay-all/`, data),
  getPayrollCycleEntries: (id: number, params?: any) => apiClient.get(`/api/workforce/payroll-cycles/${id}/entries/`, { params }),
  getPayrollSummary: () => apiClient.get('/api/workforce/payroll-cycles/summary/'),
  // Payroll Entries
  getPayrollEntries: (params?: any) => apiClient.get('/api/workforce/payroll-entries/', { params }),
  payEntry: (id: number, data?: any) => apiClient.post(`/api/workforce/payroll-entries/${id}/pay/`, data),
  processSingleEntry: (id: number) => apiClient.post(`/api/workforce/payroll-entries/${id}/process_single/`),
  createInvoice: (data: any) => apiClient.post('/api/workforce/invoices/', data),
  getPayments: (invoiceId: string) => apiClient.get(`/api/workforce/invoices/${invoiceId}/payments/`),
  createPayment: (invoiceId: string, data: any) => apiClient.post(`/api/workforce/invoices/${invoiceId}/payments/`, data),
  
  // Leave Management
  getLeaveTypes: () => apiClient.get('/api/workforce/leave-types/'),
  createLeaveType: (data: any) => apiClient.post('/api/workforce/leave-types/', data),
  getLeaveRequests: (params?: any) => apiClient.get('/api/workforce/leave-requests/', { params }),
  getLeaveInbox: () => apiClient.get('/api/workforce/leave-requests/inbox/'),
  getMyLeaveRequests: () => apiClient.get('/api/workforce/leave-requests/my_requests/'),
  createLeaveRequest: (data: any) => apiClient.post('/api/workforce/leave-requests/', data),
  updateLeaveRequest: (id: number, data: any) => apiClient.patch(`/api/workforce/leave-requests/${id}/`, data),
  cancelLeaveRequest: (id: number) => apiClient.delete(`/api/workforce/leave-requests/${id}/`),
  approveLeaveRequest: (id: number) => apiClient.post(`/api/workforce/leave-requests/${id}/approve/`),
  rejectLeaveRequest: (id: number, rejection_reason?: string) => apiClient.post(`/api/workforce/leave-requests/${id}/reject/`, { rejection_reason }),
}
