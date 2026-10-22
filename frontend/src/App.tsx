import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { FullPageSpinner } from '@/components/StateViews'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { ForbiddenPage } from '@/pages/errors/ForbiddenPage'
import { NotFoundPage } from '@/pages/errors/NotFoundPage'
import { LandingPage } from '@/pages/landing/LandingPage'
import { RequireAuth, RequireRole } from '@/routes/guards'
import { NavTracker } from '@/routes/NavTracker'

// The signed-in app is code-split so visitors to the public site never download it.
const AppShell = lazy(() => import('@/components/layout/AppShell').then((m) => ({ default: m.AppShell })))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })))
const UsersPage = lazy(() => import('@/pages/admin/UsersPage').then((m) => ({ default: m.UsersPage })))
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
              <Route path="/admin/users" element={<UsersPage />} />
            </Route>
            <Route element={<RequireRole roles={['supervisor']} />}>
              <Route path="/supervisor" element={<SupervisorDashboard />} />
              <Route path="/supervisor/employees" element={<EmployeesPage />} />
            </Route>
            <Route element={<RequireRole roles={['employee']} />}>
              <Route path="/employee" element={<EmployeeDashboard />} />
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
