import { 
  LayoutDashboard, Users, FileText, Settings, Bell, Shield, Lock,
  FolderOpen, Menu, Briefcase, UserCheck, ClipboardList, 
  Calendar, AlertTriangle, BookOpen, HardHat, Eye, 
  CheckSquare, MessageSquare, Mic, Bot, Package, Zap, Clock
} from 'lucide-react'

export type MenuRole = 'superadmin' | 'masteradmin' | 'companyuser'

export interface MenuItem {
  label: string
  description?: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles: MenuRole[]
  moduleRequired?: string
  category?: 'ergon' | 'workforce' | 'safety' | 'training' | 'communication' | 'admin'
}

// Athens original application menu structure
const ATHENS_MENU_ITEMS: MenuItem[] = [
  // Core modules
  { label: 'Dashboard', description: 'Overview and metrics', href: '/dashboard', icon: LayoutDashboard, roles: ['superadmin', 'masteradmin', 'companyuser'] },
  
  // Safety & Compliance
  { label: 'PTW', description: 'Permit to Work', href: '/ptw', icon: FileText, roles: ['companyuser'] },
  { label: 'Incident Management', description: 'Report and track incidents', href: '/incident-management', icon: AlertTriangle, roles: ['companyuser'] },
  { label: 'Safety Observation', description: 'Safety observations', href: '/safety-observation', icon: Eye, roles: ['companyuser'] },
  { label: 'Quality', description: 'Quality management', href: '/quality', icon: CheckSquare, roles: ['companyuser'] },
  { label: 'Inspection', description: 'Inspection management', href: '/inspection', icon: ClipboardList, roles: ['companyuser'] },
  
  // Training & Development
  { label: 'Training', description: 'Induction & Job Training', href: '/training', icon: BookOpen, roles: ['companyuser'] },
  { label: 'TBT', description: 'Tool Box Talk', href: '/tbt', icon: MessageSquare, roles: ['companyuser'] },
  
  // ERGON Category (Operations & Finance)
  { label: 'ERGON', description: 'Operations & Finance', href: '/ergon', icon: Zap, roles: ['companyuser'], category: 'ergon' },
  { label: 'Task Management', description: 'Create and manage tasks', href: '/ergon/tasks', icon: CheckSquare, roles: ['companyuser'], moduleRequired: 'ergon_tasks', category: 'ergon' },
  { label: 'Daily Planner', description: 'Daily task execution with SLA', href: '/ergon/planner', icon: Calendar, roles: ['companyuser'], moduleRequired: 'ergon_planner', category: 'ergon' },
  { label: 'Follow-ups', description: 'Track follow-ups', href: '/ergon/followups', icon: Bell, roles: ['companyuser'], moduleRequired: 'ergon_followups', category: 'ergon' },
  { label: 'Advance/Expenses', description: 'Manage finances', href: '/ergon/advance', icon: FileText, roles: ['companyuser'], moduleRequired: 'ergon_advance', category: 'ergon' },
  { label: 'Manpower/Machinery', description: 'Resource allocation', href: '/ergon/manpower', icon: Users, roles: ['companyuser'], moduleRequired: 'ergon_manpower', category: 'ergon' },
  { label: 'Financial Ledger', description: 'Financial tracking', href: '/ergon/ledger', icon: Briefcase, roles: ['companyuser'], moduleRequired: 'ergon_ledger', category: 'ergon' },
  
  // Workforce Category (HR & Attendance)
  { label: 'Workforce', description: 'HR & Attendance', href: '/workforce', icon: Users, roles: ['companyuser'], category: 'workforce' },
  { label: 'Profile Management', description: 'Employee profiles', href: '/workforce/profiles', icon: UserCheck, roles: ['companyuser'], moduleRequired: 'workforce_profile', category: 'workforce' },
  { label: 'Attendance', description: 'Track attendance', href: '/workforce/attendance', icon: Calendar, roles: ['companyuser'], moduleRequired: 'workforce_attendance', category: 'workforce' },
  { label: 'Leave Management', description: 'Leave requests', href: '/workforce/leave', icon: ClipboardList, roles: ['companyuser'], moduleRequired: 'workforce_leave', category: 'workforce' },
  
  // Communication & AI
  { label: 'MOM', description: 'Minutes of Meeting', href: '/mom', icon: FileText, roles: ['companyuser'] },
  { label: 'Chatbox', description: 'Team communication', href: '/chatbox', icon: MessageSquare, roles: ['companyuser'] },
  { label: 'Voice Translator', description: 'Multi-language support', href: '/voice-translator', icon: Mic, roles: ['companyuser'] },
  { label: 'AI Bot', description: 'AI assistance', href: '/ai-bot', icon: Bot, roles: ['companyuser'] },
  
  // Administration (MasterAdmin)
  { label: 'Projects', description: 'Manage projects', href: '/projects', icon: FolderOpen, roles: ['masteradmin'] },
  { label: 'Admin Users', description: 'Manage admin users', href: '/admin-users', icon: Users, roles: ['masteradmin'] },
  { label: 'Admin Attendance', description: 'Monitor admin attendance', href: '/admin-attendance', icon: Clock, roles: ['masteradmin'] },
  { label: 'Menu Management', description: 'Configure modules', href: '/menu-management', icon: Menu, roles: ['masteradmin'] },
  
  // System Administration (SuperAdmin)
  { label: 'Users', description: 'Manage SuperAdmin users', href: '/users', icon: Users, roles: ['superadmin'] },
  { label: 'Roles', description: 'Roles and permissions', href: '/roles', icon: Shield, roles: ['superadmin'] },
  { label: 'Security', description: 'Security policies', href: '/security', icon: Lock, roles: ['superadmin'] },
  { label: 'Tenants', description: 'Manage tenant companies', href: '/tenants', icon: FileText, roles: ['superadmin'] },
  { label: 'Services', description: 'Manage tenant services', href: '/services', icon: Package, roles: ['superadmin'] },
  { label: 'Subscriptions', description: 'Billing and plans', href: '/subscriptions', icon: FileText, roles: ['superadmin'] },
  { label: 'Masters', description: 'Manage master accounts', href: '/masters', icon: Users, roles: ['superadmin'] },
  { label: 'Audit Logs', description: 'Platform activity trail', href: '/audit-logs', icon: FileText, roles: ['superadmin'] },
  { label: 'Company Approvals', description: 'Approve company registrations', href: '/company-approvals', icon: FileText, roles: ['superadmin'] },
  { label: 'Configuration', description: 'System configuration', href: '/configuration', icon: Settings, roles: ['superadmin'] },
  { label: 'Notifications', description: 'Announcements & alerts', href: '/notifications', icon: Bell, roles: ['superadmin'] },
  
  // Common
  { label: 'Settings', description: 'Account settings', href: '/settings', icon: Settings, roles: ['superadmin', 'masteradmin'] },
]

export function getMenuForRole(role: MenuRole, pathPrefix: string = '', enabledModules: string[] = []): MenuItem[] {
  const items = ATHENS_MENU_ITEMS.filter(item => item.roles.includes(role))
  
  // For company users, filter by enabled modules and show category headers
  if (role === 'companyuser' && enabledModules.length > 0) {
    const filtered = items.filter(item => {
      // Always show items with no module requirement (core modules)
      if (!item.moduleRequired) return true
      // Show category header if any component in that category is enabled
      if (item.category && !item.moduleRequired) {
        const categoryComponents = items.filter(i => i.category === item.category && i.moduleRequired)
        return categoryComponents.some(c => c.moduleRequired && enabledModules.includes(c.moduleRequired))
      }
      // Show component if its module is enabled
      return enabledModules.includes(item.moduleRequired)
    })
    
    return filtered.map(item => ({ ...item, href: pathPrefix + item.href }))
  }
  
  return items.map(item => ({ ...item, href: pathPrefix + item.href }))
}

export const menuByRole = {
  superadmin: (pathPrefix = '/superadmin', enabledModules: string[] = []) => getMenuForRole('superadmin', pathPrefix, enabledModules),
  masteradmin: (pathPrefix = '/master-admin', enabledModules: string[] = []) => getMenuForRole('masteradmin', pathPrefix, enabledModules),
  companyuser: (pathPrefix = '/app', enabledModules: string[] = []) => getMenuForRole('companyuser', pathPrefix, enabledModules),
}

// Export all menu paths for CI validation
export function getAllMenuPaths(): string[] {
  const allPaths = new Set<string>()
  
  // Collect paths from all roles with their prefixes
  Object.entries(menuByRole).forEach(([role, getMenu]) => {
    const prefix = role === 'superadmin' ? '/superadmin' : 
                   role === 'masteradmin' ? '/master-admin' : ''
    getMenu(prefix).forEach(item => allPaths.add(item.href))
  })
  
  return Array.from(allPaths).sort()
}