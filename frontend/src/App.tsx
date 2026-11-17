import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { FullPageSpinner } from '@/components/StateViews'
import { RequireAuth, RequireRole } from '@/routes/guards'
import { NavTracker } from '@/routes/NavTracker'

// Public & Auth routes (code-split for fast initial load)
const LandingPage = lazy(() => import('@/pages/landing/LandingPage').then((m) => ({ default: m.LandingPage })))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const ForbiddenPage = lazy(() => import('@/pages/errors/ForbiddenPage').then((m) => ({ default: m.ForbiddenPage })))
const NotFoundPage = lazy(() => import('@/pages/errors/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

// The signed-in app is code-split so visitors to the public site never download it.
const AppShell = lazy(() => import('@/components/layout/AppShell').then((m) => ({ default: m.AppShell })))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })))
const SupervisorsPage = lazy(() =>
  import('@/pages/admin/SupervisorsPage').then((m) => ({ default: m.SupervisorsPage })),
)
const EvidencePage = lazy(() => import('@/pages/evidence/EvidencePage').then((m) => ({ default: m.EvidencePage })))
const PenaltiesPage = lazy(() => import('@/pages/supervisor/PenaltiesPage').then((m) => ({ default: m.PenaltiesPage })))
const MyPenaltiesPage = lazy(() => import('@/pages/employee/MyPenaltiesPage').then((m) => ({ default: m.MyPenaltiesPage })))
const SupervisorDashboard = lazy(() =>
  import('@/pages/supervisor/SupervisorDashboard').then((m) => ({ default: m.SupervisorDashboard })),
)
const EmployeesPage = lazy(() => import('@/pages/supervisor/EmployeesPage').then((m) => ({ default: m.EmployeesPage })))
const EmployeeDashboard = lazy(() =>
  import('@/pages/employee/EmployeeDashboard').then((m) => ({ default: m.EmployeeDashboard })),
)
const ProfilePage = lazy(() => import('@/pages/employee/ProfilePage').then((m) => ({ default: m.ProfilePage })))

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        {/* Public website: the main interface. Visible to everyone, signed in or not. */}
        <Route path="/" element={<LandingPage />} />

        {/* Never auto-redirected: a redirect here would bounce the browser's Back button straight forward again. */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route element={<RequireRole roles={['admin']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/supervisors" element={<SupervisorsPage />} />
              <Route path="/admin/evidence" element={<EvidencePage />} />
            </Route>
            <Route element={<RequireRole roles={['supervisor']} />}>
              <Route path="/supervisor" element={<SupervisorDashboard />} />
              <Route path="/supervisor/evidence" element={<EvidencePage />} />
              <Route path="/supervisor/employees" element={<EmployeesPage />} />
              <Route path="/supervisor/penalties" element={<PenaltiesPage />} />
            </Route>
            <Route element={<RequireRole roles={['employee']} />}>
              <Route path="/employee" element={<EmployeeDashboard />} />
              <Route path="/employee/penalties" element={<MyPenaltiesPage />} />
              <Route path="/employee/profile" element={<ProfilePage />} />
            </Route>
            <Route path="/403" element={<ForbiddenPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>

        {/* Signed-out visitors hitting an unknown URL */}
        <Route path="*" element={<NotFoundPage standalone />} />
      </Routes>
      <NavTracker />
    </Suspense>
  )
}
