import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
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

import LeaveTypesAdmin from './pages/LeaveTypesAdmin';
import LeaveApplicationForm from './pages/LeaveApplicationForm';
import MyLeaves from './pages/MyLeaves';
import ApprovalInbox from './pages/ApprovalInbox';
import LeaveApplicationDetail from './pages/LeaveApplicationDetail';
import LeaveCreditLedger from './pages/LeaveCreditLedger';
import LeaveDashboard from './pages/LeaveDashboard';

import AuditTrail from './pages/AuditTrail';
import AuditDashboard from './pages/AuditDashboard';
import ReportLibrary from './pages/ReportLibrary';
import COEGenerator from './pages/COEGenerator';
import ServiceRecordGenerator from './pages/ServiceRecordGenerator';

/**
 * Pick the right home dashboard based on permission.
 * Executive users get the KPI dashboard; everyone else gets the simple card view.
 */
function HomeRouter() {
  const { hasPermission } = useAuth();
  if (hasPermission('reports.executive_dashboard')) return <ExecutiveDashboard />;
  return <DashboardPage />;
}

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

              {/* Home — executive or simple */}
              <Route path="/" element={<ProtectedRoute><HomeRouter /></ProtectedRoute>} />

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

              {/* Leaves */}
              <Route path="/leaves/my"
                element={<ProtectedRoute permission="leave.view"><MyLeaves /></ProtectedRoute>} />
              <Route path="/leaves/inbox"
                element={<ProtectedRoute permission={['leave.review','leave.approve']}><ApprovalInbox /></ProtectedRoute>} />
              <Route path="/leaves/new"
                element={<ProtectedRoute permission="leave.apply"><LeaveApplicationForm /></ProtectedRoute>} />
              <Route path="/leaves/:id"
                element={<ProtectedRoute permission="leave.view"><LeaveApplicationDetail /></ProtectedRoute>} />

              <Route path="/leave-dashboard"
                element={<ProtectedRoute permission="leave_credits.view"><LeaveDashboard /></ProtectedRoute>} />
              <Route path="/leave-credits/ledger"
                element={<ProtectedRoute permission="leave_credits.view"><LeaveCreditLedger /></ProtectedRoute>} />
              <Route path="/leave-types"
                element={<ProtectedRoute permission="leave.view"><LeaveTypesAdmin /></ProtectedRoute>} />

              {/* Reports */}
              <Route path="/reports"
                element={<ProtectedRoute permission="reports.view"><ReportLibrary /></ProtectedRoute>} />
              <Route path="/reports/coe"
                element={<ProtectedRoute permission="reports.generate_coe"><COEGenerator /></ProtectedRoute>} />
              <Route path="/reports/service-record"
                element={<ProtectedRoute permission="service_records.view"><ServiceRecordGenerator /></ProtectedRoute>} />

              {/* Audit */}
              <Route path="/audit"
                element={<ProtectedRoute permission="audit_logs.view"><AuditTrail /></ProtectedRoute>} />
              <Route path="/audit/dashboard"
                element={<ProtectedRoute permission="audit_logs.view"><AuditDashboard /></ProtectedRoute>} />

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