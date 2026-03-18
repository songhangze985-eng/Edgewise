import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Dashboard from './features/dashboard/Dashboard'
import Login from './features/auth/Login'
import LGDLobby from './features/lgd/LGDLobby'
import Resume from './features/resume/Resume'
import InterviewLobby from './features/interview/InterviewLobby'
import Analytics from './features/analytics/Analytics'
import Profile from './features/profile/Profile'
import QuestionBank from './features/questions/QuestionBank'
import Management from './features/management/Management'
import PermadeathChallenge from './features/challenge/PermadeathChallenge'
import CreativeStudio from './features/studio/CreativeStudio'
import PromoLanding from './features/promo/PromoLanding'
import useAuthStore from './stores/authStore'

const LGDRoom = lazy(() => import('./features/lgd/LGDRoom'))
const InterviewRoom = lazy(() => import('./features/interview/InterviewRoom'))
const SessionReport = lazy(() => import('./features/analytics/SessionReport'))
const QuestionDetail = lazy(() => import('./features/questions/QuestionDetail'))

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

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
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

export default function App() {
  return (
    <Routes>
      <Route path="/promo" element={<PromoLanding />} />
      <Route path="/login" element={<LoginGuard />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/lgd/lobby" element={<LGDLobby />} />
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
          path="/interview/room/:id"
          element={
            <Suspense fallback={LoadingFallback}>
              <InterviewRoom />
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
        <Route path="/challenge" element={<PermadeathChallenge />} />
        <Route path="/studio" element={<CreativeStudio />} />
        <Route path="/management" element={<Management />} />
        <Route path="/analytics" element={<Analytics />} />
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
  )
}
