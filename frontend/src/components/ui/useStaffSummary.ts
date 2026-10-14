import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getDashboardByRole } from '../../services/auth';

// ตัวเลขสรุปประจำวันจริงจาก /staff/dashboard (เฉพาะบทบาท STAFF)
export const useStaffSummary = () => {
  const { hasRole } = useAuth();
  const enabled = hasRole('STAFF');
  const { data } = useQuery({
    queryKey: ['staffSummary'],
    queryFn: () => getDashboardByRole('STAFF'),
    enabled,
    refetchInterval: 15000,
  });
  return (data || null) as null | {
    pendingPaymentSlips: number;
    todayBookings: number;
    todayCheckIns: number;
    pendingRefunds: number;
    outstandingBorrowings: number;
  };
};
