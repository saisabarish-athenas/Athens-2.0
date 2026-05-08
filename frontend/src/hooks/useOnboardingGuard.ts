import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../lib/api'
import { useAuthStore } from '../store/authStore'

type GuardStatus = 'loading' | 'ok' | 'redirecting'

/**
 * For MasterAdmin users: checks company profile status and redirects accordingly.
 * Returns 'ok' only when the tenant is approved.
 *
 * FIX: `navigate` is excluded from deps (it's stable but causes loops in some
 * React Router versions). The check runs once per authenticated user identity
 * (keyed on user.id) using a ref guard to prevent duplicate calls.
 */
export function useOnboardingGuard(): GuardStatus {
  const { user, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const [status, setStatus] = useState<GuardStatus>('loading')
  // Track which user id we already ran the check for — prevents re-running on
  // every render when navigate/user object reference changes.
  const checkedForRef = useRef<number | string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setStatus('ok')
      return
    }
    if (user.user_type !== 'masteradmin') {
      setStatus('ok')
      return
    }

    // Already ran for this user — don't re-run
    const userId = (user as any).id ?? user.email
    if (checkedForRef.current === userId) return
    checkedForRef.current = userId

    apiClient.get('/api/control-plane/company-profile/me/')
      .then(res => {
        const { profile_submitted, approval_status } = res.data ?? {}
        if (!profile_submitted) {
          setStatus('redirecting')
          navigate('/master-admin/company-setup', { replace: true })
        } else if (approval_status === 'pending') {
          setStatus('redirecting')
          navigate('/master-admin/waiting', { replace: true })
        } else if (approval_status === 'rejected') {
          setStatus('redirecting')
          navigate('/master-admin/company-setup', { replace: true })
        } else {
          setStatus('ok')
        }
      })
      .catch(() => {
        // On any error (404, 403, network) — allow through, don't block the UI
        setStatus('ok')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, (user as any)?.id ?? user?.email])

  return status
}
