import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Login from './features/auth/Login'
import LGDLobby from './features/lgd/LGDLobby'
import CodingLobby from './features/coding/CodingLobby'
import Resume from './features/resume/Resume'
import InterviewLobby from './features/interview/InterviewLobby'
import Schedule from './features/schedule/Schedule'
import ExperienceList from './features/experiences/ExperienceList'
import ExperienceDetail from './features/experiences/ExperienceDetail'
import ExperienceSubmit from './features/experiences/ExperienceSubmit'
import CreatorSeries from './features/creators/CreatorSeries'
import Profile from './features/profile/Profile'
import StoryBank from './features/stories/StoryBank'
import QuestionBank from './features/questions/QuestionBank'
import PromoLanding from './features/promo/PromoLanding'
import TaskIndex from './features/tasks/TaskIndex'
import TaskPage from './features/tasks/TaskPage'
import InviteLanding from './features/research/InviteLanding'
import OrgJoin from './features/org/OrgJoin'
import OrgDashboard from './features/org/OrgDashboard'
import MentorView from './features/org/MentorView'
import SharedCardLanding from './features/share/SharedCardLanding'
import PairPractice from './features/share/PairPractice'
import ResearchPosttest from './features/research/ResearchPosttest'
import useAuthStore from './stores/authStore'
import useResearchStore from './stores/researchStore'
import { trackResearchEvent } from './research/track'
import { getDeviceType, getWeSpeechUaCategory, isWebSpeechAvailable } from './utils/device'
import A11yRootEffects from './components/a11y/A11yRootEffects'

const Dashboard = lazy(() => import('./features/dashboard/Dashboard'))
const Analytics = lazy(() => import('./features/analytics/Analytics'))
const Assessment = lazy(() => import('./features/assessment/Assessment'))
const Management = lazy(() => import('./features/management/Management'))
const ResearchStats = lazy(() => import('./features/management/research-stats/ResearchStats'))
const FrameworkPage = lazy(() => import('./features/management/framework/FrameworkPage'))
const PermadeathChallenge = lazy(() => import('./features/challenge/PermadeathChallenge'))
const CreativeStudio = lazy(() => import('./features/studio/CreativeStudio'))
const LGDRoom = lazy(() => import('./features/lgd/LGDRoom'))
const InterviewRoom = lazy(() => import('./features/interview/InterviewRoom'))
const OneWayRoom = lazy(() => import('./features/interview/OneWayRoom'))
const StructuredLobby = lazy(() => import('./features/interview/StructuredLobby'))
const StructuredRoom = lazy(() => import('./features/interview/StructuredRoom'))
const SessionReport = lazy(() => import('./features/analytics/SessionReport'))
const QuestionDetail = lazy(() => import('./features/questions/QuestionDetail'))
const CodingRoom = lazy(() => import('./features/coding/CodingRoom'))
const CaseLobby = lazy(() => import('./features/case/CaseLobby'))
const CaseRoom = lazy(() => import('./features/case/CaseRoom'))

const LoadingFallback = (
  <div
    style={{
      color: 'var(--chalk-dim)',
      padding: '2rem',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.85rem',
      letterSpacing: '0.04em',
    }}
  >
    Loading...
  </div>
)

function AuthBootstrap({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const bootstrapped = useAuthStore((s) => s.bootstrapped)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped)

  useEffect(() => {
    let cancelled = false
    const ME_BOOTSTRAP_MS = 8000
    async function bootstrap() {
      if (!accessToken) {
        if (!cancelled) setBootstrapped(true)
        return
      }
      const timeout = new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('bootstrap_timeout')), ME_BOOTSTRAP_MS)
      })
      try {
        await Promise.race([fetchMe(), timeout])
      } catch {
        if (!cancelled) setBootstrapped(true)
      }
    }
    bootstrap()
    return () => {
      cancelled = true
    }
  }, [accessToken, fetchMe, setBootstrapped])

  return children
}

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    const loginTo =
      returnTo && returnTo !== '/'
        ? `/login?redirect=${encodeURIComponent(returnTo)}`
        : '/login'
    return <Navigate to={loginTo} replace />
  }
  return children
}

function AdminRoute({ children }) {
  const user = useAuthStore((s) => s.user)
  if (!user?.isAdmin) {
    return <Navigate to="/" replace />
  }
  return children
}

function LoginGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  return <Login />
}

function DeviceTelemetry() {
  useEffect(() => {
    const run = () => {
      trackResearchEvent('device.type', {
        type: getDeviceType(),
        width: typeof window !== 'undefined' ? window.innerWidth : null,
      })
      if (!isWebSpeechAvailable()) {
        trackResearchEvent('webspeech.unsupported', {
          ua_category: getWeSpeechUaCategory(),
        })
      }
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 5000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = window.setTimeout(run, 2000)
    return () => window.clearTimeout(t)
  }, [])
  return null
}

export default function App() {
  useEffect(() => {
    useResearchStore.getState().captureFromUrl()
  }, [])

  return (
    <AuthBootstrap>
      <A11yRootEffects />
      <DeviceTelemetry />
      <Routes>
        <Route path="/promo" element={<PromoLanding />} />
        <Route path="/tasks" element={<TaskIndex />} />
        <Route path="/tasks/:slug" element={<TaskPage />} />
        <Route path="/s/:shareId" element={<SharedCardLanding />} />
        <Route path="/pair/:pairId" element={<PairPractice />} />
        <Route path="/invite/:code" element={<InviteLanding />} />
        <Route path="/org/join/:code" element={<OrgJoin />} />
        <Route path="/login" element={<LoginGuard />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route
            path="/"
            element={
              <Suspense fallback={LoadingFallback}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route path="/research/posttest" element={<ResearchPosttest />} />
          <Route path="/lgd/lobby" element={<LGDLobby />} />
          <Route path="/coding/lobby" element={<CodingLobby />} />
          <Route
            path="/case/lobby"
            element={
              <Suspense fallback={LoadingFallback}>
                <CaseLobby />
              </Suspense>
            }
          />
          <Route
            path="/case/room/:sessionId"
            element={
              <Suspense fallback={LoadingFallback}>
                <CaseRoom />
              </Suspense>
            }
          />
          <Route
            path="/coding/:sessionId"
            element={
              <Suspense fallback={LoadingFallback}>
                <CodingRoom />
              </Suspense>
            }
          />
          <Route
            path="/lgd/room/:id"
            element={
              <Suspense fallback={LoadingFallback}>
                <LGDRoom />
              </Suspense>
            }
          />
          <Route path="/resume" element={<Resume />} />
          <Route path="/interview/lobby" element={<InterviewLobby />} />
          <Route
            path="/interview/structured/lobby"
            element={
              <Suspense fallback={LoadingFallback}>
                <StructuredLobby />
              </Suspense>
            }
          />
          <Route
            path="/interview/structured/:id"
            element={
              <Suspense fallback={LoadingFallback}>
                <StructuredRoom />
              </Suspense>
            }
          />
          <Route
            path="/interview/room/:id"
            element={
              <Suspense fallback={LoadingFallback}>
                <InterviewRoom />
              </Suspense>
            }
          />
          <Route
            path="/interview/oneway/:id"
            element={
              <Suspense fallback={LoadingFallback}>
                <OneWayRoom />
              </Suspense>
            }
          />
          <Route path="/questions" element={<QuestionBank />} />
          <Route
            path="/questions/:id"
            element={
              <Suspense fallback={LoadingFallback}>
                <QuestionDetail />
              </Suspense>
            }
          />
          <Route path="/profile" element={<Profile />} />
          <Route path="/stories" element={<StoryBank />} />
          <Route
            path="/challenge"
            element={
              <Suspense fallback={LoadingFallback}>
                <PermadeathChallenge />
              </Suspense>
            }
          />
          <Route
            path="/studio"
            element={
              <Suspense fallback={LoadingFallback}>
                <CreativeStudio />
              </Suspense>
            }
          />
          <Route
            path="/management"
            element={
              <AdminRoute>
                <Suspense fallback={LoadingFallback}>
                  <Management />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route
            path="/management/research"
            element={
              <AdminRoute>
                <Suspense fallback={LoadingFallback}>
                  <ResearchStats />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route
            path="/management/framework"
            element={
              <AdminRoute>
                <Suspense fallback={LoadingFallback}>
                  <FrameworkPage />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <Suspense fallback={LoadingFallback}>
                <Analytics />
              </Suspense>
            }
          />
          <Route path="/schedule" element={<Schedule />} />
          <Route
            path="/assessment"
            element={
              <Suspense fallback={LoadingFallback}>
                <Assessment />
              </Suspense>
            }
          />
          <Route path="/experiences" element={<ExperienceList />} />
          <Route path="/experiences/submit" element={<ExperienceSubmit />} />
          <Route path="/experiences/:id" element={<ExperienceDetail />} />
          <Route path="/series/:id" element={<CreatorSeries />} />
          <Route path="/org/dashboard/:orgId" element={<OrgDashboard />} />
          <Route path="/org/mentor" element={<MentorView />} />
          <Route
            path="/analytics/report/:id"
            element={
              <Suspense fallback={LoadingFallback}>
                <SessionReport />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthBootstrap>
  )
}
