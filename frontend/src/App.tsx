import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PageLoading } from './components/PageLoading';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { CourtsListPage } from './pages/CourtsListPage';
import { CourtDetailPage } from './pages/CourtDetailPage';

// หน้าที่เข้าบ่อยตั้งแต่แรก (Login / ค้นหาสนาม) โหลดพร้อมแอป · หน้าอื่นโหลดเมื่อเปิดใช้ (code splitting ลดขนาดไฟล์ครั้งแรก)
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const HealthCheckPage = lazy(() => import('./pages/HealthCheckPage').then((m) => ({ default: m.HealthCheckPage })));
const AdminCourtsPage = lazy(() => import('./pages/AdminCourtsPage').then((m) => ({ default: m.AdminCourtsPage })));
const AdminPromotionsPage = lazy(() => import('./pages/AdminPromotionsPage').then((m) => ({ default: m.AdminPromotionsPage })));
const AdminEquipmentPage = lazy(() => import('./pages/AdminEquipmentPage').then((m) => ({ default: m.AdminEquipmentPage })));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })));
const AdminRolesPage = lazy(() => import('./pages/AdminRolesPage').then((m) => ({ default: m.AdminRolesPage })));
const AdminAuditLogsPage = lazy(() => import('./pages/AdminAuditLogsPage').then((m) => ({ default: m.AdminAuditLogsPage })));
const CreateBookingPage = lazy(() => import('./pages/CreateBookingPage').then((m) => ({ default: m.CreateBookingPage })));
const BookingSuccessPage = lazy(() => import('./pages/BookingSuccessPage').then((m) => ({ default: m.BookingSuccessPage })));
const MyBookingsPage = lazy(() => import('./pages/MyBookingsPage').then((m) => ({ default: m.MyBookingsPage })));
const BookingDetailPage = lazy(() => import('./pages/BookingDetailPage').then((m) => ({ default: m.BookingDetailPage })));
const StaffBorrowPage = lazy(() => import('./pages/StaffBorrowPage').then((m) => ({ default: m.StaffBorrowPage })));
const StaffReturnPage = lazy(() => import('./pages/StaffReturnPage').then((m) => ({ default: m.StaffReturnPage })));
const FinesPage = lazy(() => import('./pages/FinesPage').then((m) => ({ default: m.FinesPage })));
const CustomerPaymentPage = lazy(() => import('./pages/CustomerPaymentPage').then((m) => ({ default: m.CustomerPaymentPage })));
const StaffPaymentsPage = lazy(() => import('./pages/StaffPaymentsPage').then((m) => ({ default: m.StaffPaymentsPage })));
const StaffRefundsPage = lazy(() => import('./pages/StaffRefundsPage').then((m) => ({ default: m.StaffRefundsPage })));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage').then((m) => ({ default: m.ReceiptPage })));

const queryClient = new QueryClient();

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoading />}>
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
                <ProtectedRoute permission="payment.verify">
                  <StaffPaymentsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/refunds"
              element={
                <ProtectedRoute permission="refund.review">
                  <StaffRefundsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/equipment/borrow"
              element={
                <ProtectedRoute permission="equipment.lend">
                  <StaffBorrowPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/equipment/return"
              element={
                <ProtectedRoute permission="equipment.lend">
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
                <ProtectedRoute permission="court.manage">
                  <AdminCourtsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/promotions"
              element={
                <ProtectedRoute permission="catalog.manage">
                  <AdminPromotionsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/equipment"
              element={
                <ProtectedRoute permission="catalog.manage">
                  <AdminEquipmentPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/audit-logs"
              element={
                <ProtectedRoute permission="audit.view">
                  <AdminAuditLogsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute permission="settings.manage">
                  <AdminSettingsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/roles"
              element={
                <ProtectedRoute permission="role.manage">
                  <AdminRolesPage />
                </ProtectedRoute>
              }
            />
            <Route path="/health" element={<HealthCheckPage />} />

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/courts" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
