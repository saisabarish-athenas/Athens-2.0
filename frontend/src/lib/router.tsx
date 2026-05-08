import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useServiceUserStore } from '../store/serviceUserStore'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import AthensAccessGuard from '../components/auth/AthensAccessGuard'

// Export all route paths for CI validation
export const ROUTE_PATHS = [
  '/login', '/2fa', '/auth/2fa',
  '/superadmin/dashboard', '/superadmin/users', '/superadmin/roles', '/superadmin/security',
  '/superadmin/tenants', '/superadmin/masters', '/superadmin/subscriptions', '/superadmin/audit-logs',
  '/superadmin/configuration', '/superadmin/notifications', '/superadmin/settings',
  '/master-admin', '/master-admin/projects', '/master-admin/admin-users', 
  '/master-admin/admin-attendance', '/master-admin/menu-management', '/master-admin/settings',
  '/app', '/company/detailed-info', '/company/waiting-approval', '/company/services',
  '/app/inspection', '/app/inspection/list', '/app/inspection/create',
  '/company', '/company/athens/password-reset', '/company/athens/profile',
  '/company/athens/pending-approval', '/company/athens/induction',
  '/service', '/employee', '/jobs', '/services/finance/dashboard',
  '/services/finance/purchase-orders', '/services/hr/dashboard', '/services/inventory/dashboard',
  '/services/crm', '/services/sustainability/dashboard', '/services/dashboard',
  '/services/procurement/dashboard', '/services/analytics/dashboard',
  '/unauthorized', '/permission-denied'
] as const

// Lazy load components
const LoginPage = React.lazy(() => import('../pages/auth/LoginPage'))
const TwoFactorPage = React.lazy(() => import('../pages/auth/TwoFactorPage'))

// Layouts
import SuperadminLayout from '../layouts/SuperadminLayout'
import MasterAdminLayout from '../layouts/MasterAdminLayout'
import CompanyLayout from '../layouts/CompanyLayout'

// Superadmin
const SuperadminDashboard = React.lazy(() => import('../pages/superadmin/Dashboard'))
const SuperadminUsers = React.lazy(() => import('../pages/superadmin/Users/UsersList'))
const SuperadminRoles = React.lazy(() => import('../pages/superadmin/Roles/RolesList'))
const SuperadminSecurity = React.lazy(() => import('../pages/superadmin/Security/SecurityCenter'))
const SuperadminAuditLogs = React.lazy(() => import('../pages/superadmin/AuditLogs/AuditLogsList'))
const SuperadminSettings = React.lazy(() => import('../pages/superadmin/Settings'))
const SuperadminConfiguration = React.lazy(() => import('../pages/superadmin/Configuration'))
const SuperadminNotifications = React.lazy(() => import('../pages/superadmin/Notifications/NotificationsCenter'))
const SuperadminServices = React.lazy(() => import('../pages/superadmin/Services'))
const TenantsPage = React.lazy(() => import('../pages/superadmin/Tenants'))
const MastersPage = React.lazy(() => import('../pages/superadmin/Masters'))
const SubscriptionsPage = React.lazy(() => import('../pages/superadmin/Subscriptions'))
const CompanyApprovalsPage = React.lazy(() => import('../pages/superadmin/CompanyApprovals'))

// Master Admin
const MasterAdminDashboard = React.lazy(() => import('../pages/masteradmin/Dashboard'))
const MasterAdminProjects = React.lazy(() => import('../pages/masteradmin/Projects'))
const MasterAdminProjectModules = React.lazy(() => import('../pages/masteradmin/ProjectModules'))
const MasterAdminAdminUsers = React.lazy(() => import('../pages/masteradmin/AdminUsers'))
const MasterAdminMenuManagement = React.lazy(() => import('../pages/masteradmin/MenuManagement'))
const MasterAdminSettings = React.lazy(() => import('../pages/masteradmin/Settings'))
const MasterAdminServices = React.lazy(() => import('../pages/masteradmin/Services'))
const MasterAdminErgon = React.lazy(() => import('../pages/masteradmin/Ergon'))
const MasterAdminAdminAttendance = React.lazy(() => import('../pages/masteradmin/AdminAttendancePage'))
const CompanySetupPage = React.lazy(() => import('../pages/masteradmin/CompanySetupPage'))
const WaitingApprovalPage = React.lazy(() => import('../pages/masteradmin/WaitingApprovalPage'))
// ERGON Components
const ErgonLanding = React.lazy(() => import('../pages/ergon/ErgonLandingPage'))
const TaskManagement = React.lazy(() => import('../pages/ergon/TaskManagementPage'))
const DailyPlanner = React.lazy(() => import('../pages/ergon/DailyPlannerPage'))
const FollowupsPage = React.lazy(() => import('../pages/ergon/FollowupsPage'))
const AdvanceExpensesPage = React.lazy(() => import('../pages/ergon/AdvanceExpensesPage'))
const ManpowerMachineryPage = React.lazy(() => import('../pages/ergon/ManpowerMachineryPage'))
const FinancialLedgerPage = React.lazy(() => import('../pages/ergon/FinancialLedgerPage'))

// Workforce Components
const WorkforceLanding = React.lazy(() => import('../pages/workforce/WorkforceLandingPage'))
const ProfileManagementPage = React.lazy(() => import('../pages/workforce/ProfileManagementPage'))
const AttendancePage = React.lazy(() => import('../pages/workforce/AttendancePage'))
const LeaveManagementPage = React.lazy(() => import('../pages/workforce/LeaveManagementPage'))
const EmployeeManagementPage = React.lazy(() => import('../pages/workforce/EmployeeManagementPage'))
const PayrollWagesPage = React.lazy(() => import('../pages/workforce/PayrollWagesPage'))

// PTW Components
const PTWPage = React.lazy(() => import('../pages/ptw/PTWPage'))

// New Modules - Inspection
const InspectionDashboard = React.lazy(() => import('../pages/inspection/components/InspectionDashboard'))
const InspectionList = React.lazy(() => import('../pages/inspection/components/InspectionList'))
const InspectionCreate = React.lazy(() => import('../pages/inspection/components/InspectionCreate'))
const CreateACCableTestForm = React.lazy(() => import('../pages/inspection/components/CreateACCableTestForm'))
const HTCableChecklistFormCreate = React.lazy(() => import('../pages/inspection/components/forms/HTCableChecklistForm'))
const HTCableFormList = React.lazy(() => import('../pages/inspection/components/forms/HTCableFormList'))
const ACDBChecklistFormCreate = React.lazy(() => import('../pages/inspection/components/forms/ACDBChecklistForm'))
const ACDBChecklistFormList = React.lazy(() => import('../pages/inspection/components/forms/ACDBChecklistFormList'))
const HTPreCommissionForm = React.lazy(() => import('../pages/inspection/components/forms/HTPreCommissionForm'))
const HTPreCommissionFormList = React.lazy(() => import('../pages/inspection/components/forms/HTPreCommissionFormList'))
const HTPreCommissionTemplateForm = React.lazy(() => import('../pages/inspection/components/forms/HTPreCommissionTemplateForm'))
const HTPreCommissionTemplateFormList = React.lazy(() => import('../pages/inspection/components/forms/HTPreCommissionTemplateFormList'))
const CivilWorkChecklistForm = React.lazy(() => import('../pages/inspection/components/forms/CivilWorkChecklistForm'))
const CivilWorkChecklistFormList = React.lazy(() => import('../pages/inspection/components/forms/CivilWorkChecklistFormList'))
const CementRegisterForm = React.lazy(() => import('../pages/inspection/components/forms/CementRegisterForm'))
const CementRegisterFormList = React.lazy(() => import('../pages/inspection/components/forms/CementRegisterFormList'))
const ConcretePourCardForm = React.lazy(() => import('../pages/inspection/components/forms/ConcretePourCardForm'))
const ConcretePourCardFormList = React.lazy(() => import('../pages/inspection/components/forms/ConcretePourCardFormList'))
const PCCChecklistForm = React.lazy(() => import('../pages/inspection/components/forms/PCCChecklistForm'))
const PCCChecklistFormList = React.lazy(() => import('../pages/inspection/components/forms/PCCChecklistFormList'))
const BarBendingScheduleForm = React.lazy(() => import('../pages/inspection/components/forms/BarBendingScheduleForm'))
const BarBendingScheduleFormList = React.lazy(() => import('../pages/inspection/components/forms/BarBendingScheduleFormList'))
const BatteryChargerChecklistForm = React.lazy(() => import('../pages/inspection/components/forms/BatteryChargerChecklistForm'))
const BatteryChargerChecklistFormList = React.lazy(() => import('../pages/inspection/components/forms/BatteryChargerChecklistFormList'))
const BatteryUPSChecklistForm = React.lazy(() => import('../pages/inspection/components/forms/BatteryUPSChecklistForm'))
const BatteryUPSChecklistFormList = React.lazy(() => import('../pages/inspection/components/forms/BatteryUPSChecklistFormList'))
const BusDuctChecklistForm = React.lazy(() => import('../pages/inspection/components/forms/BusDuctChecklistForm'))
const BusDuctChecklistFormList = React.lazy(() => import('../pages/inspection/components/forms/BusDuctChecklistFormList'))
const ControlCableChecklistForm = React.lazy(() => import('../pages/inspection/components/forms/ControlCableChecklistForm'))
const ControlCableChecklistFormList = React.lazy(() => import('../pages/inspection/components/forms/ControlCableChecklistFormList'))
const ControlRoomAuditChecklistForm = React.lazy(() => import('../pages/inspection/components/forms/ControlRoomAuditChecklistForm'))
const ControlRoomAuditChecklistFormList = React.lazy(() => import('../pages/inspection/components/forms/ControlRoomAuditChecklistFormList'))
const EarthingChecklistForm = React.lazy(() => import('../pages/inspection/components/forms/EarthingChecklistForm'))
const EarthingChecklistFormList = React.lazy(() => import('../pages/inspection/components/forms/EarthingChecklistFormList'))
const ACCableFormList = React.lazy(() => import('../pages/inspection/components/forms/ACCableFormList'))

// Incident Management
const IncidentManagementPage = React.lazy(() => import('../pages/incidentmanagement/IncidentManagementPage'))

// ESG
const ESGDashboard = React.lazy(() => import('../pages/esg/components/CarbonFootprintDashboard'))

// Safety Observation
const SafetyObservationRoutes = React.lazy(() => import('../pages/safetyobservation/index'))

// Quality
const QualityDashboard = React.lazy(() => import('../pages/quality/components/DefectManagement'))

// MoM
const MoMList = React.lazy(() => import('../pages/mom/components/MomList'))
const MoMEdit = React.lazy(() => import('../pages/mom/components/MomEdit'))
const MoMView = React.lazy(() => import('../pages/mom/components/MomView'))
const MoMLive = React.lazy(() => import('../pages/mom/components/MomLive'))

// Training Modules
const TrainingPage = React.lazy(() => import('../pages/training/TrainingPage'))
const TBTPage = React.lazy(() => import('../pages/tbt/TBTPage'))
const ChatboxPage = React.lazy(() => import('../pages/company/ChatboxPage'))
const VoiceTranslatorPage = React.lazy(() => import('../pages/company/VoiceTranslatorPage'))
const AIBotPage = React.lazy(() => import('../pages/company/AIBotPage'))



// Company
const CompanyDashboard = React.lazy(() => import('../pages/company/DashboardSimple'))
const CompanySettings = React.lazy(() => import('../pages/company/CompanySettings'))
const DetailedInfoForm = React.lazy(() => import('../pages/company/DetailedInfoForm'))
const AthensFirstLoginPasswordReset = React.lazy(() => import('../pages/company/AthensFirstLoginPasswordReset'))
const AthensProfileCompletion = React.lazy(() => import('../pages/company/AthensProfileCompletion'))
const AthensPendingApproval = React.lazy(() => import('../pages/company/AthensPendingApproval'))
const AthensInductionPending = React.lazy(() => import('../pages/company/AthensInductionPending'))
const ServiceSelection = React.lazy(() => import('../pages/company/ServiceSelection'))
const FinanceDashboard = React.lazy(() => import('../pages/services/finance/pages/Dashboard'))
const PurchaseOrders = React.lazy(() => import('../pages/services/finance/pages/PurchaseOrders'))
const HRDashboard = React.lazy(() => import('../pages/services/hr/pages/Dashboard'))
const InventoryDashboard = React.lazy(() => import('../pages/services/inventory/pages/Dashboard'))
const CRMRoutes = React.lazy(() => import('../pages/services/crm/index'))
const WaitingApproval = React.lazy(() => import('../pages/company/WaitingApproval'))
const NotFoundPage = React.lazy(() => import('../pages/NotFoundPage'))
const PermissionDenied = React.lazy(() => import('../pages/PermissionDenied'))
const SubscriptionExpired = React.lazy(() => import('../pages/SubscriptionExpired'))
const EmployeeApp = React.lazy(() => import('../pages/EmployeeApp'))
const JobPortal = React.lazy(() => import('../pages/public/JobPortal'))
const JobApplication = React.lazy(() => import('../pages/public/JobApplication'))
const PublicJobDetail = React.lazy(() => import('../pages/public/PublicJobDetail'))

// User Panel
import UserLayout from '../layouts/UserLayout'
const UserDashboard = React.lazy(() => import('../pages/user/Dashboard'))
const ProfileSetupPage = React.lazy(() => import('../pages/user/ProfileSetupPage'))
const UserWaitingApprovalPage = React.lazy(() => import('../pages/user/WaitingApprovalPage'))
const UserRejectedPage = React.lazy(() => import('../pages/user/WaitingApprovalPage'))
const ProfileManagementAdminPage = React.lazy(() => import('../pages/workforce/ProfileManagementAdminPage'))
const EmployeeApprovalsPage = React.lazy(() => import('../pages/workforce/ProfileManagementAdminPage'))

// DEV-ONLY Routes
const SapUiPreview = import.meta.env.DEV ? React.lazy(() => import('../pages/__dev__/SapUiPreview')) : null

// Protected Route Component
interface ProtectedRouteProps {
  children: React.ReactNode
  requireSuperAdmin?: boolean
  requireMasterAdmin?: boolean
  requireCompanyUser?: boolean
  requireApproved?: boolean
  requireServiceUser?: boolean
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireSuperAdmin = false,
  requireMasterAdmin = false,
  requireCompanyUser = false,
  requireApproved = false,
  requireServiceUser = false,
}) => {
  const { isAuthenticated, user, firstLoginRequired, approvalPending, isLoading } = useAuthStore()
  const { isAuthenticated: isServiceUserAuthenticated, serviceUser } = useServiceUserStore()
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    )
  }

  React.useEffect(() => {
    if (requireServiceUser) {
      const sessionKey = sessionStorage.getItem('service_session_key')
      if (!sessionKey) {
        try {
          const storeData = localStorage.getItem('service-user-storage')
          if (storeData) {
            const parsed = JSON.parse(storeData)
            const storeSessionKey = parsed?.state?.sessionKey
            if (storeSessionKey) {
              sessionStorage.setItem('service_session_key', storeSessionKey)
              return
            }
          }
        } catch (error) {
        }
        window.location.replace('/login')
      }
    }
  }, [requireServiceUser])

  if (requireServiceUser) {
    if (!isServiceUserAuthenticated || !serviceUser) {
      const sessionKey = sessionStorage.getItem('service_session_key')
      if (!sessionKey) {
        try {
          const storeData = localStorage.getItem('service-user-storage')
          if (storeData) {
            const parsed = JSON.parse(storeData)
            const storeSessionKey = parsed?.state?.sessionKey
            if (storeSessionKey && parsed?.state?.serviceUser) {
              sessionStorage.setItem('service_session_key', storeSessionKey)
              return <>{children}</>
            }
          }
        } catch (error) {
        }
      }
      return <Navigate to="/login" replace />
    }
    return <>{children}</>
  }

  if (!isAuthenticated || !user) {
    const has2FACredentials = sessionStorage.getItem('2fa_credentials')
    if (has2FACredentials) {
      return <Navigate to="/auth/2fa" replace />
    }
    return <Navigate to="/login" replace />
  }

  // Check user type from user object
  const userType = (user as any).user_type

  if (requireSuperAdmin && userType !== 'superadmin') {
    return <Navigate to="/permission-denied" replace />
  }

  if (requireMasterAdmin && userType !== 'masteradmin') {
    return <Navigate to="/permission-denied" replace />
  }

  if (requireCompanyUser && userType !== 'companyuser') {
    return <Navigate to="/permission-denied" replace />
  }

  // Block role_type=user from admin-only routes — but allow module pages
  if (userType === 'companyuser' && (user as any).role_type === 'user' && requireApproved) {
    // Users can access module pages (/app/ptw, /app/training, etc.) but not admin pages
    const adminOnlyPaths = ['/app/workforce/employees', '/app/workforce/profiles', '/app/workforce/payroll', '/app/settings']
    const isAdminOnly = adminOnlyPaths.some(p => window.location.pathname.startsWith(p))
    if (isAdminOnly) return <Navigate to="/user/dashboard" replace />
    // Allow through for module pages
  }

  if (userType === 'companyuser' && firstLoginRequired && window.location.pathname !== '/company/detailed-info') {
    return <Navigate to="/company/detailed-info" replace />
  }

  if (userType === 'companyuser' && approvalPending && requireApproved && window.location.pathname !== '/company/waiting-approval') {
    return <Navigate to="/company/waiting-approval" replace />
  }

  return <>{children}</>
}

// Public Route Component
interface PublicRouteProps {
  children: React.ReactNode
}

const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore()

  // Auto-redirect based on user type
  useEffect(() => {
    if (isAuthenticated && user && window.location.pathname === '/') {
      const userType = (user as any).user_type
      const nextRoute = sessionStorage.getItem('next_route')
      
      // Clear the next_route to prevent loops
      sessionStorage.removeItem('next_route')
      
      if (nextRoute && nextRoute !== '/services/athens_sustainability/dashboard') {
        window.location.href = nextRoute
      } else if (userType === 'superadmin') {
        window.location.href = '/superadmin/dashboard'
      } else if (userType === 'masteradmin') {
        window.location.href = '/master-admin'
      } else if (userType === 'companyuser') {
        const roleType = (user as any)?.role_type
        const nextRoute = sessionStorage.getItem('next_route')
        sessionStorage.removeItem('next_route')
        if (roleType === 'user') {
          // Regular user — respect backend next_route
          if (nextRoute && ['/user/profile-setup', '/user/waiting-approval', '/user/rejected', '/user/dashboard'].includes(nextRoute)) {
            window.location.href = nextRoute
          } else {
            window.location.href = '/user/dashboard'
          }
        } else {
          window.location.href = '/app'
        }
      } else if (userType === 'serviceuser') {
        window.location.href = '/service'
      }
    }
  }, [isAuthenticated, user])

  if (window.location.pathname === '/auth/2fa' || window.location.pathname === '/2fa') {
    return <>{children}</>
  }

  if (window.location.pathname === '/login') {
    return <>{children}</>
  }

  return <>{children}</>
}

// Loading wrapper
const SuspenseWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  }>
    {children}
  </Suspense>
)

// Guard that blocks role_type=user from admin-only workforce routes
const UserWorkforceGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore()
  if ((user as any)?.role_type === 'user') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Unauthorized</h1>
          <p className="text-gray-600">You do not have permission to access this page.</p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}

// Guard for role_type=user — enforces the full onboarding state machine
const UserGuard: React.FC<{ children: React.ReactNode; requireApproved?: boolean }> = ({ children, requireApproved = false }) => {
  const { isAuthenticated, user, isLoading } = useAuthStore()

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
  }

  if (!isAuthenticated || !user) return <Navigate to="/login" replace />

  const userType = (user as any).user_type
  const roleType = (user as any).role_type

  // Block non-users from user panel
  if (userType !== 'companyuser' || roleType !== 'user') {
    return <Navigate to="/permission-denied" replace />
  }

  const isFirstLogin = (user as any).is_first_login
  const approvalStatus = (user as any).approval_status
  const path = window.location.pathname

  // Enforce onboarding state machine
  if (isFirstLogin && path !== '/user/profile-setup') {
    return <Navigate to="/user/profile-setup" replace />
  }
  if (!isFirstLogin && approvalStatus === 'pending' && path !== '/user/waiting-approval') {
    return <Navigate to="/user/waiting-approval" replace />
  }
  if (!isFirstLogin && approvalStatus === 'rejected' && path !== '/user/rejected') {
    return <Navigate to="/user/rejected" replace />
  }
  if (requireApproved && approvalStatus !== 'approved') {
    return <Navigate to="/user/waiting-approval" replace />
  }

  return <>{children}</>
}

export const AppRouter: React.FC = () => {
  // DEV-ONLY routes
  const devRoutes = import.meta.env.DEV && SapUiPreview ? [
    <Route
      key="sap-ui-preview"
      path="/__dev__/sap-ui"
      element={
        <SuspenseWrapper>
          <SapUiPreview />
        </SuspenseWrapper>
      }
    />
  ] : [];

  return (
    <Routes>
      {/* DEV-ONLY Routes */}
      {devRoutes}

      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <SuspenseWrapper>
              <LoginPage />
            </SuspenseWrapper>
          </PublicRoute>
        }
      />

      <Route
        path="/2fa"
        element={
          <PublicRoute>
            <SuspenseWrapper>
              <TwoFactorPage />
            </SuspenseWrapper>
          </PublicRoute>
        }
      />

      <Route
        path="/auth/2fa"
        element={
          <PublicRoute>
            <SuspenseWrapper>
              <TwoFactorPage />
            </SuspenseWrapper>
          </PublicRoute>
        }
      />

      {/* Superadmin Routes */}
      <Route path="/superadmin" element={
        <ProtectedRoute requireSuperAdmin>
          <SuperadminLayout />
        </ProtectedRoute>
      }>
        <Route path="dashboard" element={<SuspenseWrapper><SuperadminDashboard /></SuspenseWrapper>} />
        <Route path="users" element={<SuspenseWrapper><SuperadminUsers /></SuspenseWrapper>} />
        <Route path="roles" element={<SuspenseWrapper><SuperadminRoles /></SuspenseWrapper>} />
        <Route path="security" element={<SuspenseWrapper><SuperadminSecurity /></SuspenseWrapper>} />
        <Route path="tenants" element={<SuspenseWrapper><TenantsPage /></SuspenseWrapper>} />
        <Route path="services" element={<SuspenseWrapper><SuperadminServices /></SuspenseWrapper>} />
        <Route path="masters" element={<SuspenseWrapper><MastersPage /></SuspenseWrapper>} />
        <Route path="subscriptions" element={<SuspenseWrapper><SubscriptionsPage /></SuspenseWrapper>} />
        <Route path="audit-logs" element={<SuspenseWrapper><SuperadminAuditLogs /></SuspenseWrapper>} />
        <Route path="configuration" element={<SuspenseWrapper><SuperadminConfiguration /></SuspenseWrapper>} />
        <Route path="notifications" element={<SuspenseWrapper><SuperadminNotifications /></SuspenseWrapper>} />
        <Route path="settings" element={<SuspenseWrapper><SuperadminSettings /></SuspenseWrapper>} />
        <Route path="company-approvals" element={<SuspenseWrapper><CompanyApprovalsPage /></SuspenseWrapper>} />
      </Route>

      {/* Master Admin Routes */}
      <Route path="/master-admin" element={
        <ProtectedRoute requireMasterAdmin>
          <MasterAdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<SuspenseWrapper><MasterAdminDashboard /></SuspenseWrapper>} />
        <Route path="dashboard" element={<SuspenseWrapper><MasterAdminDashboard /></SuspenseWrapper>} />
        <Route path="analytics" element={<SuspenseWrapper><MasterAdminDashboard /></SuspenseWrapper>} />
        <Route path="company-setup" element={<SuspenseWrapper><CompanySetupPage /></SuspenseWrapper>} />
        <Route path="waiting" element={<SuspenseWrapper><WaitingApprovalPage /></SuspenseWrapper>} />
        <Route path="projects" element={<SuspenseWrapper><MasterAdminProjects /></SuspenseWrapper>} />
        <Route path="projects/:projectId/modules" element={<SuspenseWrapper><MasterAdminProjectModules /></SuspenseWrapper>} />
        <Route path="admin-users" element={<SuspenseWrapper><MasterAdminAdminUsers /></SuspenseWrapper>} />
        <Route path="admin-attendance" element={<SuspenseWrapper><MasterAdminAdminAttendance /></SuspenseWrapper>} />
        <Route path="menu-management" element={<SuspenseWrapper><MasterAdminMenuManagement /></SuspenseWrapper>} />
        <Route path="settings" element={<SuspenseWrapper><MasterAdminSettings /></SuspenseWrapper>} />
      </Route>



      {/* Company User Routes */}
      <Route path="/app" element={
        <ProtectedRoute requireCompanyUser requireApproved>
          <CompanyLayout />
        </ProtectedRoute>
      }>
        <Route index element={<SuspenseWrapper><CompanyDashboard /></SuspenseWrapper>} />
        <Route path="dashboard" element={<SuspenseWrapper><CompanyDashboard /></SuspenseWrapper>} />
        <Route path="settings" element={<SuspenseWrapper><CompanySettings /></SuspenseWrapper>} />
        
        {/* ERGON Category Routes */}
        <Route path="ergon" element={<SuspenseWrapper><ErgonLanding /></SuspenseWrapper>} />
        <Route path="ergon/tasks" element={<SuspenseWrapper><TaskManagement /></SuspenseWrapper>} />
        <Route path="ergon/planner" element={<SuspenseWrapper><DailyPlanner /></SuspenseWrapper>} />
        <Route path="ergon/followups" element={<SuspenseWrapper><FollowupsPage /></SuspenseWrapper>} />
        <Route path="ergon/advance" element={<SuspenseWrapper><AdvanceExpensesPage /></SuspenseWrapper>} />
        <Route path="ergon/manpower" element={<SuspenseWrapper><ManpowerMachineryPage /></SuspenseWrapper>} />
        <Route path="ergon/ledger" element={<SuspenseWrapper><FinancialLedgerPage /></SuspenseWrapper>} />
        
        {/* Workforce Category Routes */}
        <Route path="workforce" element={<SuspenseWrapper><WorkforceLanding /></SuspenseWrapper>} />
        <Route path="workforce/profiles" element={<SuspenseWrapper><UserWorkforceGuard><ProfileManagementPage /></UserWorkforceGuard></SuspenseWrapper>} />
        <Route path="workforce/attendance" element={<SuspenseWrapper><AttendancePage /></SuspenseWrapper>} />
        <Route path="workforce/leave" element={<SuspenseWrapper><LeaveManagementPage /></SuspenseWrapper>} />
        <Route path="workforce/employees" element={<SuspenseWrapper><UserWorkforceGuard><EmployeeManagementPage /></UserWorkforceGuard></SuspenseWrapper>} />
        <Route path="workforce/payroll" element={<SuspenseWrapper><UserWorkforceGuard><PayrollWagesPage /></UserWorkforceGuard></SuspenseWrapper>} />
        
        {/* PTW Routes */}
        <Route path="ptw" element={<SuspenseWrapper><PTWPage /></SuspenseWrapper>} />
        
        {/* New Module Routes */}
        <Route path="inspection" element={<SuspenseWrapper><InspectionDashboard /></SuspenseWrapper>} />
        <Route path="inspection/list" element={<SuspenseWrapper><InspectionList /></SuspenseWrapper>} />
        <Route path="inspection/create" element={<SuspenseWrapper><InspectionCreate /></SuspenseWrapper>} />
        <Route path="inspection/forms/ac-cable-testing/create" element={<SuspenseWrapper><CreateACCableTestForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/ht-cable/list" element={<SuspenseWrapper><HTCableFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/ht-cable/create" element={<SuspenseWrapper><HTCableChecklistFormCreate /></SuspenseWrapper>} />
        <Route path="inspection/forms/acdb-checklist/list" element={<SuspenseWrapper><ACDBChecklistFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/acdb-checklist/create" element={<SuspenseWrapper><ACDBChecklistFormCreate /></SuspenseWrapper>} />
        <Route path="inspection/view/:id" element={<SuspenseWrapper><InspectionList /></SuspenseWrapper>} />
        <Route path="inspection/edit/:id" element={<SuspenseWrapper><InspectionCreate /></SuspenseWrapper>} />
        
        <Route path="incident-management" element={<SuspenseWrapper><IncidentManagementPage /></SuspenseWrapper>} />
        
        <Route path="esg" element={<SuspenseWrapper><ESGDashboard /></SuspenseWrapper>} />
        
        <Route path="safety-observation/*" element={<SuspenseWrapper><SafetyObservationRoutes /></SuspenseWrapper>} />
        
        <Route path="quality" element={<SuspenseWrapper><QualityDashboard /></SuspenseWrapper>} />
        
        <Route path="mom" element={<SuspenseWrapper><MoMList /></SuspenseWrapper>} />
        <Route path="mom/edit/:id" element={<SuspenseWrapper><MoMEdit /></SuspenseWrapper>} />
        <Route path="mom/view/:id" element={<SuspenseWrapper><MoMView /></SuspenseWrapper>} />
        <Route path="mom/live/:id" element={<SuspenseWrapper><MoMLive /></SuspenseWrapper>} />
        
        <Route path="training" element={<SuspenseWrapper><TrainingPage /></SuspenseWrapper>} />
        
        <Route path="tbt" element={<SuspenseWrapper><TBTPage /></SuspenseWrapper>} />
        
        <Route path="chatbox" element={<SuspenseWrapper><ChatboxPage /></SuspenseWrapper>} />
        
        <Route path="voice-translator" element={<SuspenseWrapper><VoiceTranslatorPage /></SuspenseWrapper>} />
        
        <Route path="ai-bot" element={<SuspenseWrapper><AIBotPage /></SuspenseWrapper>} />
        
        <Route path="settings" element={<SuspenseWrapper><MasterAdminSettings /></SuspenseWrapper>} />
      </Route>

      <Route
        path="/company/detailed-info"
        element={
          <ProtectedRoute requireCompanyUser>
            <SuspenseWrapper>
              <DetailedInfoForm />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company/waiting-approval"
        element={
          <ProtectedRoute requireCompanyUser>
            <SuspenseWrapper>
              <WaitingApproval />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company/services"
        element={
          <ProtectedRoute requireCompanyUser requireApproved>
            <SuspenseWrapper>
              <ServiceSelection />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company"
        element={
          <ProtectedRoute requireCompanyUser requireApproved>
            <SuspenseWrapper>
              <CompanyDashboard />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company/athens/password-reset"
        element={
          <ProtectedRoute requireCompanyUser requireApproved>
            <AthensAccessGuard>
              <SuspenseWrapper>
                <AthensFirstLoginPasswordReset />
              </SuspenseWrapper>
            </AthensAccessGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company/athens/profile"
        element={
          <ProtectedRoute requireCompanyUser requireApproved>
            <AthensAccessGuard>
              <SuspenseWrapper>
                <AthensProfileCompletion />
              </SuspenseWrapper>
            </AthensAccessGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company/athens/pending-approval"
        element={
          <ProtectedRoute requireCompanyUser requireApproved>
            <AthensAccessGuard>
              <SuspenseWrapper>
                <AthensPendingApproval />
              </SuspenseWrapper>
            </AthensAccessGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company/athens/induction"
        element={
          <ProtectedRoute requireCompanyUser requireApproved>
            <AthensAccessGuard>
              <SuspenseWrapper>
                <AthensInductionPending />
              </SuspenseWrapper>
            </AthensAccessGuard>
          </ProtectedRoute>
        }
      />

      {/* Service Routes */}
      <Route
        path="/service"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-blue-600 mb-4">Service Dashboard</h1>
                  <p className="text-gray-600">Service dashboard coming soon!</p>
                </div>
              </div>
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      {/* Employee Mobile App */}
      <Route
        path="/employee"
        element={
          <SuspenseWrapper>
            <EmployeeApp />
          </SuspenseWrapper>
        }
      />

      {/* Public Job Portal Routes */}
      <Route
        path="/jobs"
        element={
          <SuspenseWrapper>
            <JobPortal />
          </SuspenseWrapper>
        }
      />
      
      <Route
        path="/jobs/:jobId"
        element={
          <SuspenseWrapper>
            <PublicJobDetail />
          </SuspenseWrapper>
        }
      />
      
      <Route
        path="/jobs/:jobId/apply"
        element={
          <SuspenseWrapper>
            <JobApplication />
          </SuspenseWrapper>
        }
      />
      
      <Route
        path="/public/jobs/:jobId"
        element={
          <SuspenseWrapper>
            <PublicJobDetail />
          </SuspenseWrapper>
        }
      />

      {/* Service Dashboards - Protected */}
      <Route
        path="/services/finance/dashboard"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <FinanceDashboard />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/services/finance/purchase-orders"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <PurchaseOrders />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/services/hr/dashboard"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <HRDashboard />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/services/inventory/dashboard"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <InventoryDashboard />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      {/* CRM Service Routes - Protected */}
      <Route
        path="/services/crm/*"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <CRMRoutes />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      {/* Athens Sustainability Routes - Remove redirect loop */}
      <Route
        path="/services/athens_sustainability/*"
        element={
          <ProtectedRoute requireCompanyUser>
            <SuspenseWrapper>
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-green-600 mb-4">Athens Sustainability</h1>
                  <p className="text-gray-600">Athens Sustainability module coming soon!</p>
                </div>
              </div>
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      {/* Athens Sustainability Dashboard */}
      <Route
        path="/services/sustainability/dashboard"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-green-600 mb-4">Athens Sustainability Dashboard</h1>
                  <p className="text-gray-600">Athens Sustainability Dashboard coming soon!</p>
                </div>
              </div>
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      {/* Generic Services Dashboard - redirect to appropriate service */}
      <Route
        path="/services/dashboard"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-blue-600 mb-4">Service Dashboard</h1>
                  <p className="text-gray-600">Please select a specific service from your dashboard.</p>
                </div>
              </div>
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/services/procurement/dashboard"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-orange-600 mb-4">Procurement Dashboard</h1>
                  <p className="text-gray-600">Procurement Dashboard coming soon!</p>
                </div>
              </div>
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/services/analytics/dashboard"
        element={
          <ProtectedRoute requireServiceUser>
            <SuspenseWrapper>
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-indigo-600 mb-4">Analytics Dashboard</h1>
                  <p className="text-gray-600">Business Analytics Dashboard coming soon!</p>
                </div>
              </div>
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      {/* User Panel Routes (role_type=user) */}
      <Route path="/user" element={
        <UserGuard requireApproved>
          <UserLayout />
        </UserGuard>
      }>
        <Route path="dashboard" element={<SuspenseWrapper><UserDashboard /></SuspenseWrapper>} />
      </Route>
      {/* Profile setup — guarded but does NOT require approved */}
      <Route
        path="/user/profile-setup"
        element={
          <UserGuard>
            <SuspenseWrapper>
              <ProfileSetupPage />
            </SuspenseWrapper>
          </UserGuard>
        }
      />

      <Route
        path="/user/waiting-approval"
        element={
          <UserGuard>
            <SuspenseWrapper>
              <UserWaitingApprovalPage />
            </SuspenseWrapper>
          </UserGuard>
        }
      />

      <Route
        path="/user/rejected"
        element={
          <UserGuard>
            <SuspenseWrapper>
              <UserRejectedPage />
            </SuspenseWrapper>
          </UserGuard>
        }
      />

      {/* Default Routes */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      
      {/* /dashboard/inspection/* â†’ mirrors /app/inspection/* (inspection module uses this prefix) */}
      <Route path="/dashboard" element={
        <ProtectedRoute requireCompanyUser requireApproved>
          <CompanyLayout />
        </ProtectedRoute>
      }>
        <Route path="inspection" element={<SuspenseWrapper><InspectionDashboard /></SuspenseWrapper>} />
        <Route path="inspection/list" element={<SuspenseWrapper><InspectionList /></SuspenseWrapper>} />
        <Route path="inspection/create" element={<SuspenseWrapper><InspectionCreate /></SuspenseWrapper>} />
        <Route path="inspection/forms/ac-cable-testing/create" element={<SuspenseWrapper><CreateACCableTestForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/ht-cable/list" element={<SuspenseWrapper><HTCableFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/ht-cable/create" element={<SuspenseWrapper><HTCableChecklistFormCreate /></SuspenseWrapper>} />
        <Route path="inspection/forms/acdb-checklist/list" element={<SuspenseWrapper><ACDBChecklistFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/acdb-checklist/create" element={<SuspenseWrapper><ACDBChecklistFormCreate /></SuspenseWrapper>} />
        
        {/* HT Pre-Commission Routes */}
        <Route path="inspection/forms/ht-precommission/list" element={
          <SuspenseWrapper>
            <HTPreCommissionFormList />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/ht-precommission/create" element={
          <SuspenseWrapper>
            <HTPreCommissionForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/ht-precommission/view/:id" element={
          <SuspenseWrapper>
            <HTPreCommissionForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/ht-precommission/edit/:id" element={
          <SuspenseWrapper>
            <HTPreCommissionForm />
          </SuspenseWrapper>
        } />
        
        {/* HT Pre-Commission Template Routes */}
        <Route path="inspection/forms/ht-precommission-template/list" element={
          <SuspenseWrapper>
            <HTPreCommissionTemplateFormList />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/ht-precommission-template/create" element={
          <SuspenseWrapper>
            <HTPreCommissionTemplateForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/ht-precommission-template/view/:id" element={
          <SuspenseWrapper>
            <HTPreCommissionTemplateForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/ht-precommission-template/edit/:id" element={
          <SuspenseWrapper>
            <HTPreCommissionTemplateForm />
          </SuspenseWrapper>
        } />

        {/* Civil Work Checklist Routes */}
        <Route path="inspection/forms/civil-work-checklist/list" element={
          <SuspenseWrapper>
            <CivilWorkChecklistFormList />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/civil-work-checklist/create" element={
          <SuspenseWrapper>
            <CivilWorkChecklistForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/civil-work-checklist/view/:id" element={
          <SuspenseWrapper>
            <CivilWorkChecklistForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/civil-work-checklist/edit/:id" element={
          <SuspenseWrapper>
            <CivilWorkChecklistForm />
          </SuspenseWrapper>
        } />

        {/* Cement Register Routes */}
        <Route path="inspection/forms/cement-register/list" element={
          <SuspenseWrapper>
            <CementRegisterFormList />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/cement-register/create" element={
          <SuspenseWrapper>
            <CementRegisterForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/cement-register/view/:id" element={
          <SuspenseWrapper>
            <CementRegisterForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/cement-register/edit/:id" element={
          <SuspenseWrapper>
            <CementRegisterForm />
          </SuspenseWrapper>
        } />

        {/* Concrete Pour Card Routes */}
        <Route path="inspection/forms/concrete-pour-card/list" element={
          <SuspenseWrapper>
            <ConcretePourCardFormList />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/concrete-pour-card/create" element={
          <SuspenseWrapper>
            <ConcretePourCardForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/concrete-pour-card/view/:id" element={
          <SuspenseWrapper>
            <ConcretePourCardForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/concrete-pour-card/edit/:id" element={
          <SuspenseWrapper>
            <ConcretePourCardForm />
          </SuspenseWrapper>
        } />

        {/* PCC Checklist Routes */}
        <Route path="inspection/forms/pcc-checklist/list" element={
          <SuspenseWrapper>
            <PCCChecklistFormList />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/pcc-checklist/create" element={
          <SuspenseWrapper>
            <PCCChecklistForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/pcc-checklist/view/:id" element={
          <SuspenseWrapper>
            <PCCChecklistForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/pcc-checklist/edit/:id" element={
          <SuspenseWrapper>
            <PCCChecklistForm />
          </SuspenseWrapper>
        } />

        {/* Bar Bending Schedule Routes */}
        <Route path="inspection/forms/bar-bending-schedule/list" element={
          <SuspenseWrapper>
            <BarBendingScheduleFormList />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/bar-bending-schedule/create" element={
          <SuspenseWrapper>
            <BarBendingScheduleForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/bar-bending-schedule/view/:id" element={
          <SuspenseWrapper>
            <BarBendingScheduleForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/bar-bending-schedule/edit/:id" element={
          <SuspenseWrapper>
            <BarBendingScheduleForm />
          </SuspenseWrapper>
        } />

        {/* Battery Charger Checklist Routes */}
        <Route path="inspection/forms/battery-charger-checklist/list" element={
          <SuspenseWrapper>
            <BatteryChargerChecklistFormList />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/battery-charger-checklist/create" element={
          <SuspenseWrapper>
            <BatteryChargerChecklistForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/battery-charger-checklist/view/:id" element={
          <SuspenseWrapper>
            <BatteryChargerChecklistForm />
          </SuspenseWrapper>
        } />
        <Route path="inspection/forms/battery-charger-checklist/edit/:id" element={
          <SuspenseWrapper>
            <BatteryChargerChecklistForm />
          </SuspenseWrapper>
        } />

        {/* Battery UPS Checklist Routes */}
        <Route path="inspection/forms/battery-ups-checklist/list" element={<SuspenseWrapper><BatteryUPSChecklistFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/battery-ups-checklist/create" element={<SuspenseWrapper><BatteryUPSChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/battery-ups-checklist/view/:id" element={<SuspenseWrapper><BatteryUPSChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/battery-ups-checklist/edit/:id" element={<SuspenseWrapper><BatteryUPSChecklistForm /></SuspenseWrapper>} />

        {/* Bus Duct Checklist Routes */}
        <Route path="inspection/forms/bus-duct-checklist/list" element={<SuspenseWrapper><BusDuctChecklistFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/bus-duct-checklist/create" element={<SuspenseWrapper><BusDuctChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/bus-duct-checklist/view/:id" element={<SuspenseWrapper><BusDuctChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/bus-duct-checklist/edit/:id" element={<SuspenseWrapper><BusDuctChecklistForm /></SuspenseWrapper>} />

        {/* Control Cable Checklist Routes */}
        <Route path="inspection/forms/control-cable-checklist/list" element={<SuspenseWrapper><ControlCableChecklistFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/control-cable-checklist/create" element={<SuspenseWrapper><ControlCableChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/control-cable-checklist/view/:id" element={<SuspenseWrapper><ControlCableChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/control-cable-checklist/edit/:id" element={<SuspenseWrapper><ControlCableChecklistForm /></SuspenseWrapper>} />

        {/* Control Room Audit Checklist Routes */}
        <Route path="inspection/forms/control-room-audit-checklist/list" element={<SuspenseWrapper><ControlRoomAuditChecklistFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/control-room-audit-checklist/create" element={<SuspenseWrapper><ControlRoomAuditChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/control-room-audit-checklist/view/:id" element={<SuspenseWrapper><ControlRoomAuditChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/control-room-audit-checklist/edit/:id" element={<SuspenseWrapper><ControlRoomAuditChecklistForm /></SuspenseWrapper>} />

        {/* Earthing Checklist Routes */}
        <Route path="inspection/forms/earthing-checklist/list" element={<SuspenseWrapper><EarthingChecklistFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/earthing-checklist/create" element={<SuspenseWrapper><EarthingChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/earthing-checklist/view/:id" element={<SuspenseWrapper><EarthingChecklistForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/earthing-checklist/edit/:id" element={<SuspenseWrapper><EarthingChecklistForm /></SuspenseWrapper>} />

        {/* AC Cable Testing Routes */}
        <Route path="inspection/forms/ac-cable-testing/list" element={<SuspenseWrapper><ACCableFormList /></SuspenseWrapper>} />
        <Route path="inspection/forms/ac-cable-testing/view/:id" element={<SuspenseWrapper><CreateACCableTestForm /></SuspenseWrapper>} />
        <Route path="inspection/forms/ac-cable-testing/edit/:id" element={<SuspenseWrapper><CreateACCableTestForm /></SuspenseWrapper>} />
        
        <Route path="inspection/view/:id" element={<SuspenseWrapper><InspectionList /></SuspenseWrapper>} />
        <Route path="inspection/edit/:id" element={<SuspenseWrapper><InspectionCreate /></SuspenseWrapper>} />
        <Route path="inspection/forms/:formType/create" element={<SuspenseWrapper><InspectionCreate /></SuspenseWrapper>} />
        <Route path="inspection/forms/:formType/list" element={<SuspenseWrapper><InspectionCreate /></SuspenseWrapper>} />
        <Route path="inspection/forms/:formType/view/:id" element={<SuspenseWrapper><InspectionCreate /></SuspenseWrapper>} />
        <Route path="inspection/forms/:formType/edit/:id" element={<SuspenseWrapper><InspectionCreate /></SuspenseWrapper>} />
      </Route>
      
      <Route
        path="/subscription-expired"
        element={
          <SuspenseWrapper>
            <SubscriptionExpired />
          </SuspenseWrapper>
        }
      />

      <Route
        path="/unauthorized"
        element={
          <SuspenseWrapper>
            <PermissionDenied />
          </SuspenseWrapper>
        }
      />

      <Route
        path="/permission-denied"
        element={
          <SuspenseWrapper>
            <PermissionDenied />
          </SuspenseWrapper>
        }
      />

      <Route
        path="*"
        element={
          <SuspenseWrapper>
            <NotFoundPage />
          </SuspenseWrapper>
        }
      />
    </Routes>
  )
}

