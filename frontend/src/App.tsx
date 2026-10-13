import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { HealthCheckPage } from './pages/HealthCheckPage';
import { CourtsListPage } from './pages/CourtsListPage';
import { CourtDetailPage } from './pages/CourtDetailPage';
import { AdminCourtsPage } from './pages/AdminCourtsPage';
import { AdminPromotionsPage } from './pages/AdminPromotionsPage';
import { AdminEquipmentPage } from './pages/AdminEquipmentPage';
import { AdminAuditLogsPage } from './pages/AdminAuditLogsPage';
import { CreateBookingPage } from './pages/CreateBookingPage';
import { BookingSuccessPage } from './pages/BookingSuccessPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { BookingDetailPage } from './pages/BookingDetailPage';
import { StaffBorrowPage } from './pages/StaffBorrowPage';
import { StaffReturnPage } from './pages/StaffReturnPage';
import { FinesPage } from './pages/FinesPage';
import { CustomerPaymentPage } from './pages/CustomerPaymentPage';
import { StaffPaymentsPage } from './pages/StaffPaymentsPage';
import { StaffRefundsPage } from './pages/StaffRefundsPage';
import { ReceiptPage } from './pages/ReceiptPage';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            
            {/* Public Court Routes */}
            <Route path="/courts" element={<CourtsListPage />} />
            <Route path="/courts/:id" element={<CourtDetailPage />} />

            {/* Protected Booking Routes */}
            <Route
              path="/booking"
              element={
                <ProtectedRoute>
                  <CreateBookingPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/booking/success"
              element={
                <ProtectedRoute>
                  <BookingSuccessPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-bookings"
              element={
                <ProtectedRoute>
                  <MyBookingsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-bookings/:id"
              element={
                <ProtectedRoute>
                  <BookingDetailPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/payment"
              element={
                <ProtectedRoute>
                  <CustomerPaymentPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/payment/:bookingId"
              element={
                <ProtectedRoute>
                  <CustomerPaymentPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/receipt/:bookingId"
              element={
                <ProtectedRoute>
                  <ReceiptPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/fines"
              element={
                <ProtectedRoute>
                  <FinesPage />
                </ProtectedRoute>
              }
            />

            {/* Staff Equipment Borrowing / Return, Payment Verification & Refund Routes */}
            <Route
              path="/staff/payments"
              element={
                <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
                  <StaffPaymentsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/refunds"
              element={
                <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
                  <StaffRefundsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/equipment/borrow"
              element={
                <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
                  <StaffBorrowPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/equipment/return"
              element={
                <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
                  <StaffReturnPage />
                </ProtectedRoute>
              }
            />

            {/* Other Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/courts"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminCourtsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/promotions"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminPromotionsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/equipment"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminEquipmentPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/audit-logs"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminAuditLogsPage />
                </ProtectedRoute>
              }
            />

            <Route path="/health" element={<HealthCheckPage />} />

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/courts" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
