import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RoleManagement from './pages/RoleManagement';
import UserProfileSetup from './pages/UserProfileSetup';
import ForbiddenPage from './pages/ForbiddenPage';

import EmployeeDirectory from './pages/EmployeeDirectory';
import EmployeeDetail from './pages/EmployeeDetail';
import EmployeeForm from './pages/EmployeeForm';
import DepartmentManagement from './pages/DepartmentManagement';
import PositionManagement from './pages/PositionManagement';
import OrgChart from './pages/OrgChart';

import DTRList from './pages/DTRList';
import DTRViewer from './pages/DTRViewer';
import AttendanceDashboard from './pages/AttendanceDashboard';
import HolidayCalendar from './pages/HolidayCalendar';
import AttendanceThresholds from './pages/AttendanceThresholds';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              element={
                <ProtectedRoute requireProfileComplete={false}>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/profile/setup"
                element={<ProtectedRoute requireProfileComplete={false}><UserProfileSetup /></ProtectedRoute>} />
              <Route path="/forbidden" element={<ForbiddenPage />} />

              <Route path="/"
                element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

              {/* Employees */}
              <Route path="/employees"
                element={<ProtectedRoute permission="employees.view"><EmployeeDirectory /></ProtectedRoute>} />
              <Route path="/employees/new"
                element={<ProtectedRoute permission="employees.create"><EmployeeForm /></ProtectedRoute>} />
              <Route path="/employees/:id"
                element={<ProtectedRoute permission="employees.view"><EmployeeDetail /></ProtectedRoute>} />
              <Route path="/employees/:id/edit"
                element={<ProtectedRoute permission="employees.update"><EmployeeForm /></ProtectedRoute>} />

              {/* Master data */}
              <Route path="/departments"
                element={<ProtectedRoute permission="departments.view"><DepartmentManagement /></ProtectedRoute>} />
              <Route path="/positions"
                element={<ProtectedRoute permission="positions.view"><PositionManagement /></ProtectedRoute>} />
              <Route path="/org"
                element={<ProtectedRoute permission="departments.view"><OrgChart /></ProtectedRoute>} />

              {/* Attendance */}
              <Route path="/dtr"
                element={<ProtectedRoute permission="dtr.view"><DTRList /></ProtectedRoute>} />
              <Route path="/dtr/:id"
                element={<ProtectedRoute permission="dtr.view"><DTRViewer /></ProtectedRoute>} />
              <Route path="/attendance"
                element={<ProtectedRoute permission="attendance.view"><AttendanceDashboard /></ProtectedRoute>} />
              <Route path="/attendance/thresholds"
                element={<ProtectedRoute permission="attendance.view"><AttendanceThresholds /></ProtectedRoute>} />
              <Route path="/holidays"
                element={<ProtectedRoute permission="dtr.view"><HolidayCalendar /></ProtectedRoute>} />

              {/* Admin */}
              <Route path="/roles"
                element={<ProtectedRoute permission="roles.view"><RoleManagement /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}