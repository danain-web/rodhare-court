import { BookingService } from './booking.service';
import { NotificationJobsService } from './notification-jobs.service';

export interface MaintenanceResult {
  expired: number;
  noShow: number;
  completed: number;
  remindersFirst: number;
  remindersSecond: number;
  emailsSent: number;
  emailsFailed: number;
  errors: string[];
}

// งานเบื้องหลังทั้งหมดในที่เดียว: ใช้ทั้งตัวตั้งเวลาในโปรเซส (ตอนเซิร์ฟเวอร์ตื่น) และ endpoint ที่ cron ภายนอกเรียก (ปลุก Render ที่หลับ)
// แต่ละขั้นแยก try/catch — ขั้นหนึ่งล้มต้องไม่ขวางขั้นอื่น (เช่น อีเมลล่มไม่ควรหยุดการปล่อยสนาม)
export class MaintenanceService {
  private bookingService = new BookingService();
  private notificationJobs = new NotificationJobsService();

  async runAll(): Promise<MaintenanceResult> {
    const result: MaintenanceResult = {
      expired: 0, noShow: 0, completed: 0, remindersFirst: 0, remindersSecond: 0, emailsSent: 0, emailsFailed: 0, errors: [],
    };

    try {
      const m = await this.bookingService.runMaintenance();
      result.expired = m.expired;
      result.noShow = m.noShow;
      result.completed = m.completed;
    } catch (err) {
      result.errors.push(`maintenance: ${(err as Error).message}`);
    }
    try {
      const r = await this.notificationJobs.sendDueReminders();
      result.remindersFirst = r.first;
      result.remindersSecond = r.second;
    } catch (err) {
      result.errors.push(`reminders: ${(err as Error).message}`);
    }
    try {
      const e = await this.notificationJobs.dispatchPendingEmails();
      result.emailsSent = e.sent;
      result.emailsFailed = e.failed;
    } catch (err) {
      result.errors.push(`emails: ${(err as Error).message}`);
    }
    return result;
  }
}
