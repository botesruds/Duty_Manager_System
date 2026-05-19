import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Home from './pages/Home'

import AdminOverview from './pages/admin/Overview'
import AdminStaff from './pages/admin/Staff'
import AdminDepartments from './pages/admin/Departments'
import AdminBookings from './pages/admin/Bookings'
import AdminLocations from './pages/admin/Locations'
import AdminSchedule from './pages/admin/Schedule'
import AdminMasterSchedule from './pages/admin/MasterSchedule'
import AdminAttendance from './pages/admin/Attendance'

import TeacherDashboard from './pages/teacher/Dashboard'
import TeacherSlots from './pages/teacher/Slots'
import TeacherSwaps from './pages/teacher/Swaps'

import SelfReport from './pages/attendance/SelfReport'
import Monitor from './pages/attendance/Monitor'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Home />} />

          <Route path="admin" element={<ProtectedRoute requireAdmin><AdminOverview /></ProtectedRoute>} />
          <Route path="admin/staff" element={<ProtectedRoute requireAdmin><AdminStaff /></ProtectedRoute>} />
          <Route path="admin/departments" element={<ProtectedRoute requireAdmin><AdminDepartments /></ProtectedRoute>} />
          <Route path="admin/bookings" element={<ProtectedRoute requireAdmin><AdminBookings /></ProtectedRoute>} />
          <Route path="admin/locations" element={<ProtectedRoute requireAdmin><AdminLocations /></ProtectedRoute>} />
          <Route path="admin/schedule" element={<ProtectedRoute requireAdmin><AdminSchedule /></ProtectedRoute>} />
          <Route path="admin/master" element={<ProtectedRoute requireAdmin><AdminMasterSchedule /></ProtectedRoute>} />
          <Route path="admin/attendance" element={<ProtectedRoute requireAdmin><AdminAttendance /></ProtectedRoute>} />

          <Route path="teacher" element={<TeacherDashboard />} />
          <Route path="teacher/slots" element={<TeacherSlots />} />
          <Route path="teacher/swaps" element={<TeacherSwaps />} />

          <Route path="attendance/self" element={<SelfReport />} />
          <Route path="attendance/monitor" element={<ProtectedRoute requireMonitor><Monitor /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
