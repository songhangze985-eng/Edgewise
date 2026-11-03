import { useEffect, useState, useMemo, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import LazyThreeBackground from '../ThreeBackground/LazyThreeBackground'
import AICopilot from '../AICopilot/AICopilot'
import Toast from '../Toast/Toast'
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary'
import ResearchConsentModal from '../ResearchConsentModal/ResearchConsentModal'
import ResearchExperimentOnboarding from '../ResearchExperimentOnboarding/ResearchExperimentOnboarding'
import MicroSurveyModal from '../MicroSurveyModal/MicroSurveyModal'
import useAuthStore from '../../stores/authStore'
import useResearchStore from '../../stores/researchStore'
import useSurveyStore from '../../stores/surveyStore'
import useSettingsStore from '../../stores/settingsStore'
import MobileTabBar from './MobileTabBar'
import OfflineNotice from '../OfflineNotice/OfflineNotice'
import { isImmersiveRoute } from './navConfig'
import { useIsMobileLayout } from '../../hooks/useMediaQuery'
import { useEffectiveReduceMotion } from '../../hooks/useEffectiveReduceMotion'
import styles from './Layout.module.css'

const SIDEBAR_COLLAPSED_KEY = 'edgewise.sidebar.collapsed'

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function ResearchConsentGate() {
  const user = useAuthStore((s) => s.user)
  const needsConsent = Boolean(user && user.researchConsent === null)
  if (!needsConsent) return null
  return <ResearchConsentModal />
}

function ResearchExperimentGate() {
  const user = useAuthStore((s) => s.user)
  const shouldShowOnboarding = useResearchStore((s) => s.shouldShowOnboarding)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const assignment = user?.experimentAssignment
    const accepted = user?.researchConsent?.accepted
    if (accepted && assignment?.arm && shouldShowOnboarding(assignment.arm)) {
      setOpen(true)
    } else {
      setOpen(false)
    }
  }, [user, shouldShowOnboarding])

  if (!open || !user?.experimentAssignment) return null

  return (
    <ResearchExperimentOnboarding
      assignment={user.experimentAssignment}
      onDismiss={() => setOpen(false)}
    />
  )
}

function MicroSurveyGate() {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const checkPending = useSurveyStore((s) => s.checkPending)
  const checkedRef = useRef(false)

  const isBlocked =
    location.pathname.startsWith('/interview/room')
    || location.pathname.startsWith('/interview/oneway')
    || location.pathname.startsWith('/lgd/room')

  useEffect(() => {
    const accepted = user?.researchConsent?.accepted
    if (accepted && !isBlocked && !checkedRef.current) {
      checkedRef.current = true
      checkPending('app_ready')
    }
  }, [user, isBlocked, checkPending])

  if (!user?.researchConsent?.accepted || isBlocked) return null

  return <MicroSurveyModal />
}

export default function Layout() {
  const location = useLocation()
  const prefersReducedMotion = useEffectiveReduceMotion()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const aiCopilotEnabled = useSettingsStore((s) => s.aiCopilotEnabled)

  const isMobileLayout = useIsMobileLayout()

  const threeBackgroundMode = useMemo(() => {
    const path = location.pathname
    if (isMobileLayout) return 'off'
    if (
      path.startsWith('/interview/room')
      || path.startsWith('/interview/oneway')
      || path.startsWith('/interview/structured/')
      || path.startsWith('/lgd/room')
      || path.startsWith('/coding/')
      || path.startsWith('/case/room')
      || path.startsWith('/questions/')
    ) {
      return 'off'
    }
    return prefersReducedMotion ? 'static' : 'active'
  }, [location.pathname, prefersReducedMotion, isMobileLayout])

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore quota / private mode */
      }
      return next
    })
  }

  return (
    <div
      className={`${styles.layout} ${sidebarCollapsed ? styles['sidebar-collapsed'] : ''} ${
        isMobileLayout ? styles['layout-mobile'] : ''
      }`}
    >
      <LazyThreeBackground mode={threeBackgroundMode} opacity={0.25} />
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
      <main className={styles['main-content']}>
        <div className={styles['content-area']}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
      {aiCopilotEnabled
        && !location.pathname.startsWith('/interview/room')
        && !location.pathname.startsWith('/interview/oneway')
        && !location.pathname.startsWith('/interview/structured/')
        && !location.pathname.startsWith('/coding/')
        && !location.pathname.startsWith('/research/posttest')
        && !location.pathname.startsWith('/management') && <AICopilot />}
      <Toast />
      <ResearchConsentGate />
      <ResearchExperimentGate />
      <MicroSurveyGate />
      {!isImmersiveRoute(location.pathname) && <MobileTabBar />}
      <OfflineNotice />
    </div>
  )
}
