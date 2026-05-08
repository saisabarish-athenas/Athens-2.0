import React, { useState, useEffect } from 'react'
import { useNavigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { LogOut, Menu, Bell } from 'lucide-react'
import { ThemeToggle } from '../components/theme/ThemeToggle'
import { SapSidebar } from '../components/layout/SapSidebar'
import { menuByRole } from '../components/layout/menuConfig'
import { useEnabledModules } from '../hooks/useEnabledModules'
import { apiClient } from '../lib/api'
import tokenManager from '../lib/tokenManager'
import { App as AntdApp } from 'antd'

const CompanyLayout: React.FC = () => {
  const navigate = useNavigate()
  const { user, logout, hydrated } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [companyInfo, setCompanyInfo] = useState<{ name: string; logo: string | null }>({ name: '', logo: null })
  const { enabledModules } = useEnabledModules()

  // Filter menu items by enabled modules
  const sidebarItems = menuByRole.companyuser('/app', enabledModules)

  useEffect(() => {
    // Patch C: Only fetch if token exists
    if (hydrated && user && tokenManager.hasTokens()) {
      fetchCompanyInfo()
    }
  }, [hydrated, user])

  const fetchCompanyInfo = async () => {
    try {
      const response = await apiClient.getCompanyDetails()
      setCompanyInfo({
        name: response.data.company_name || 'Company',
        logo: response.data.company_logo
      })
    } catch (error) {
      // Don't spam console for expected no-token case
      if ((error as any)?.code !== 'NO_AUTH_TOKEN') {
      }
      // Fallback to user data
      setCompanyInfo({
        name: user?.company_name || 'Company',
        logo: null
      })
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app-canvas text-foreground">
      {/* Fixed Header */}
      <header className="z-40 shrink-0 bg-gradient-to-r from-background via-background to-primary/5 backdrop-blur-xl shadow-lg rounded-b-2xl">
        <div className="flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 text-muted-foreground hover:bg-accent rounded-lg transition-colors lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-600 to-primary shadow-md flex items-center justify-center overflow-hidden">
                  {companyInfo.logo ? (
                    <img src={companyInfo.logo} alt="Company Logo" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xl text-amber-400">🏢</span>
                  )}
                </div>
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-emerald-500 rounded-full border-2 border-background" />
              </div>
              <div className="hidden md:block">
                {user?.admin_type ? (
                  // Admin users see ATHENS 2.0 branding
                  <>
                    <div className="text-sm font-normal text-foreground">ᗩTᕼᙓᑎ𝔖 2.0</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <span>🏗️</span>
                      <span>Project Portal</span>
                    </div>
                  </>
                ) : (
                  // Project users see company name
                  <>
                    <div className="text-sm font-semibold text-foreground">{companyInfo.name}</div>
                    <div className="text-xs text-muted-foreground">Project Management</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 px-4 py-1.5 bg-white/80 dark:bg-card/80 rounded-full shadow-sm">
            <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {user?.admin_type ? companyInfo.name : `Tenant: ${user?.athens_tenant_id || 'N/A'}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="p-2 text-muted-foreground hover:bg-accent/50 rounded-full transition-all relative">
              <Bell className="w-4 h-4" />
            </button>
            <div className="h-6 w-px bg-border/50 mx-1" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent/30 to-accent/10 rounded-full">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-green-600 to-blue-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="hidden md:block">
                <div className="text-xs font-medium text-foreground leading-tight">{user?.email?.split('@')[0] || 'user'}</div>
                <div className="text-[10px] text-muted-foreground">
                  {user?.admin_type 
                    ? `${user.admin_type.charAt(0).toUpperCase() + user.admin_type.slice(1)} Admin`
                    : user?.user_type === 'masteradmin' 
                      ? 'Master Admin'
                      : 'Project User'
                  }
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="ml-1 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-full transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Container */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <SapSidebar
          title="Navigation"
          subtitle="Project Portal"
          items={sidebarItems}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        {/* Main Content */}
          <main className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="max-w-[1600px] mx-auto px-6 py-6">
                <AntdApp>
                  <Outlet />
                </AntdApp>
              </div>
            </div>
          </main>
      </div>
    </div>
  )
}

export default CompanyLayout
