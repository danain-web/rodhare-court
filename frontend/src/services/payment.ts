import api from './api';
import { Payment, Receipt, NotificationItem, SlipVerification, SubmitPaymentResult } from '../types/payment';

// =====================================================================
// ส่งสลิปชำระเงิน — ใช้ multipart/form-data + Multer (Buffer)
// เหตุผล: ส่ง binary file ตรงๆ ไม่ต้อง encode เป็น base64 (~33% เล็กกว่า)
//         Backend รับจาก req.file (Multer Memory Storage)
//         field name: 'slip' (ตรงกับ upload.single('slip') ใน payment.routes.ts)
// =====================================================================
export const submitPaymentApi = async (data: {
  bookingId: number;
  amount: number;
  paymentMethod?: string;
  slipFile?: File;           // File object จาก <input type="file">
  slipUrl?: string;          // fallback ถ้าไม่มีไฟล์
  slipReference?: string;
}): Promise<SubmitPaymentResult> => {
  const form = new FormData();
  form.append('bookingId', String(data.bookingId));
  form.append('amount', String(data.amount));
  form.append('paymentMethod', data.paymentMethod || 'PROMPTPAY');
  if (data.slipReference) form.append('slipReference', data.slipReference);
  if (data.slipUrl) form.append('slipUrl', data.slipUrl);
  // field ชื่อ 'slip' ตรงกับ upload.single('slip') ใน Backend
  if (data.slipFile) form.append('slip', data.slipFile);

  const response = await api.post('/payments', form, {
    // ไม่ต้องตั้ง Content-Type เอง: Axios + FormData จะ set multipart/form-data + boundary อัตโนมัติ
    headers: { 'Content-Type': undefined },
  });

  // Backend ส่ง { result, message, checks, payment, receipt } (SlipVerificationResult)
  // แปลงเป็นรูปที่หน้า CustomerPaymentPage ใช้: Payment + { verification }
  const res: SlipVerificationResponse = response.data.data;
  return {
    ...res.payment,
    verification: { result: res.result, message: res.message, checks: res.checks ?? [], receipt: res.receipt },
  };
};

type SlipVerificationResponse = Pick<SlipVerification, 'result' | 'message' | 'checks' | 'receipt'> & { payment: Payment };

export const getPendingPaymentsApi = async (): Promise<Payment[]> => {
  const response = await api.get('/staff/payments/pending');
  return response.data.data;
};

export const verifyPaymentApi = async (paymentId: number): Promise<{ receipt: Receipt; notification: NotificationItem }> => {
  const response = await api.post(`/staff/payments/${paymentId}/verify`);
  return response.data.data;
};

export const rejectPaymentApi = async (paymentId: number, reason: string): Promise<void> => {
  await api.post(`/staff/payments/${paymentId}/reject`, { reason });
};

export const getReceiptByBookingApi = async (bookingId: number): Promise<Receipt> => {
  const response = await api.get(`/receipts/booking/${bookingId}`);
  return response.data.data;
};

export const getMyNotificationsApi = async (): Promise<NotificationItem[]> => {
  const response = await api.get('/notifications/my');
  return response.data.data;
};

export const markNotificationReadApi = async (notificationId: number): Promise<void> => {
  await api.patch(`/notifications/${notificationId}/read`);
};
