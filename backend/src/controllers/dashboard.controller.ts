import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { withConnection } from '../config/db';
import { ReportRepository } from '../repositories/report.repository';
import { currentUser } from './helpers';

// ตัวเลขทุกตัวดึงจากฐานข้อมูลจริง (เดิม hardcode เช่น activeBookings: 2, totalUsers: 142)
export class DashboardController {
  private reportRepository = new ReportRepository();

  getCustomerDashboard = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const summary = await withConnection((conn) => this.reportRepository.customerSummary(conn, user.userId));
    return sendSuccess(
      res,
      {
        role: 'CUSTOMER',
        user,
        capabilities: ['Search Courts', 'Book Court', 'View My Bookings', 'Upload Slip', 'Check-in', 'Notifications'],
        ...summary,
      },
      'Customer Dashboard Data'
    );
  };

  getStaffDashboard = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const summary = await withConnection((conn) => this.reportRepository.staffSummary(conn));
    return sendSuccess(
      res,
      {
        role: 'STAFF',
        user,
        capabilities: ['Verify Slip & Payments', 'Customer Check-in', 'Issue/Return Equipment', 'Approve Refunds'],
        ...summary,
      },
      'Staff Dashboard Data'
    );
  };

  getAdminDashboard = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const summary = await withConnection((conn) => this.reportRepository.adminSummary(conn));
    return sendSuccess(
      res,
      {
        role: 'ADMIN',
        user,
        capabilities: [
          'Manage Courts & Sports',
          'Manage Pricing Rates & Promotions',
          'View Audit Logs',
          'View Reports',
        ],
        ...summary,
      },
      'Admin Dashboard Data'
    );
  };

  // BR17: รายงานสรุปการจอง รายได้ และสถิติการใช้งานสนาม (ผู้บริหารและผู้ดูแลระบบ)
  getExecutiveDashboard = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const summary = await withConnection((conn) => this.reportRepository.executiveSummary(conn));
    return sendSuccess(
      res,
      {
        role: 'EXECUTIVE',
        user,
        capabilities: ['Executive Revenue & Sales Dashboard', 'Court Utilization Statistics', 'Booking Volume Analytics', 'Equipment Rental & Inventory Metrics'],
        ...summary,
        generatedAt: new Date().toISOString(),
      },
      'Executive Dashboard Data'
    );
  };
}
