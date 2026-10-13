import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getBookingByIdApi, checkInBookingApi, getBookingPaymentsApi } from '../services/booking';
import { getCancelRefundPreviewApi, executeCancelRefundApi, updateBookingApi, CancelRefundPreview } from '../services/refund';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import {
  Alert,
  Breadcrumb,
  CountdownBanner,
  EmptyState,
  InfoRow,
  LoadingState,
  Modal,
  StatusBadge,
  apiErrorMessage,
  formatDateTime,
  formatTHB,
  formatThaiDate,
  hoursBetween,
} from '../components/ui';
import {
  AlertCircle,
  CalendarDays,
  CircleX,
  Clock,
  CreditCard,
  History,
  Loader2,
  LogIn,
  MapPin,
  Package,
  Pencil,
  QrCode,
  ReceiptText,
  Upload,
  Wallet,
} from 'lucide-react';

// รายละเอียดการจอง: ชำระเงิน / แก้ไขวันเวลา (BR5) / ยกเลิกคืนเงิน (BR12) / เช็คอิน (BR8)
export const BookingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const bookingId = parseInt(id || '1', 10);

  // Modals state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<CancelRefundPreview | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateDate, setUpdateDate] = useState('');
  const [updateStartTime, setUpdateStartTime] = useState('');
  const [updateEndTime, setUpdateEndTime] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const { data: booking, isLoading, refetch } = useQuery({
    queryKey: ['bookingDetail', bookingId],
    queryFn: () => getBookingByIdApi(bookingId),
    refetchInterval: 15000,
  });

  const { data: payments = [], refetch: refetchPayments } = useQuery({
    queryKey: ['bookingPayments', bookingId],
    queryFn: () => getBookingPaymentsApi(bookingId),
  });

  // Open Cancel Modal & fetch preview
  const handleOpenCancelModal = async () => {
    setActionError(null);
    try {
      const preview = await getCancelRefundPreviewApi(bookingId);
      setCancelPreview(preview);
      setShowCancelModal(true);
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to fetch refund preview');
    }
  };

  // Confirm Cancel
  const handleConfirmCancel = async () => {
    setIsSubmittingCancel(true);
    try {
      await executeCancelRefundApi(bookingId, cancelReason);
      setShowCancelModal(false);
      setActionSuccess('ยกเลิกการจองเรียบร้อยแล้ว');
      refetch();
      refetchPayments();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to cancel booking');
      setShowCancelModal(false);
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Open Update Modal
  const handleOpenUpdateModal = () => {
    if (booking) {
      setUpdateDate(booking.bookingDate);
      setUpdateStartTime(booking.startTime);
      setUpdateEndTime(booking.endTime);
      setUpdateError('');
      setShowUpdateModal(true);
    }
  };

  // Submit Update
  const handleConfirmUpdate = async () => {
    setUpdateError('');
    setIsSubmittingUpdate(true);
    try {
      await updateBookingApi(bookingId, {
        bookingDate: updateDate,
        startTime: updateStartTime,
        endTime: updateEndTime,
      });
      setShowUpdateModal(false);
      setActionSuccess('แก้ไขวันและเวลาการจองเรียบร้อยแล้ว (BR5)');
      refetch();
    } catch (err: any) {
      setUpdateError(err.response?.data?.message || 'Failed to update booking');
    } finally {
      setIsSubmittingUpdate(false);
    }
  };

  // BR8 เช็คอินด้วยตนเอง
  const handleCheckIn = async () => {
    setActionError(null);
    setIsCheckingIn(true);
    try {
      await checkInBookingApi(bookingId);
      setActionSuccess('เช็คอินเข้าใช้สนามสำเร็จ');
      refetch();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setIsCheckingIn(false);
    }
  };

  if (isLoading) {
    return (
      <CustomerLayout>
        <LoadingState label="กำลังโหลดรายละเอียดการจอง..." />
      </CustomerLayout>
    );
  }

  if (!booking) {
    return (
      <CustomerLayout>
        <EmptyState
          title="ไม่พบการจอง"
          action={
            <Link to="/my-bookings" className="btn-primary">
              กลับไปรายการจองของฉัน
            </Link>
          }
        />
      </CustomerLayout>
    );
  }

  const b: any = booking;
  const canModify = ['PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED'].includes(booking.status);
  const isPaid = ['CONFIRMED', 'PAYMENT_VERIFIED', 'CHECKED_IN', 'COMPLETED'].includes(booking.status);
  const slipPending = b.latestPaymentStatus === 'PENDING';

  return (
    <CustomerLayout>
      <Breadcrumb items={[{ label: 'รายการจองของฉัน', to: '/my-bookings' }, { label: `การจอง #${booking.bookingNumber}` }]} />

      <section className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-900 text-mint-300">
            <ReceiptText className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500">รหัสอ้างอิงการจอง (Booking Reference)</div>
            <h1 className="font-mono text-2xl font-bold text-forest-950">#{booking.bookingNumber}</h1>
            <div className="text-[11px] text-slate-500">สร้างเมื่อ {formatDateTime(booking.createdAt)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} />
          {b.latestPaymentStatus && (
            <span className="badge-slate">
              สลิปล่าสุด: <StatusBadge status={b.latestPaymentStatus} />
            </span>
          )}
        </div>
      </section>

      {booking.status === 'PENDING_PAYMENT' && !slipPending && <CountdownBanner expiresAt={b.holdExpiresAt} />}
      {slipPending && (
        <Alert tone="info" title="ส่งสลิปแล้ว — รอเจ้าหน้าที่ตรวจสอบ (UC-7)">
          ระบบหยุดนับเวลา 15 นาทีแล้ว ระหว่างรอตรวจสอบไม่สามารถแก้ไขการจองได้
        </Alert>
      )}
      {b.latestPaymentStatus === 'REJECTED' && booking.status === 'PENDING_PAYMENT' && (
        <Alert tone="warning" title="สลิปล่าสุดถูกปฏิเสธ">
          เหตุผล: {b.latestPaymentRejectionReason || '-'} — กรุณาอัปโหลดสลิปใหม่ภายในเวลาที่เหลือ
        </Alert>
      )}
      {actionError && <Alert tone="error" title="ระบบปฏิเสธการทำรายการ" onClose={() => setActionError(null)}>{actionError}</Alert>}
      {actionSuccess && <Alert tone="success" title={actionSuccess} onClose={() => setActionSuccess(null)} />}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <div className="card space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-forest-950">รายละเอียดการจองสนาม</h2>
              {canModify && (
                <button onClick={handleOpenUpdateModal} className="btn-soft px-3 py-1.5 text-xs">
                  <Pencil className="h-3.5 w-3.5" /> เปลี่ยนวัน/เวลา (BR5)
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: <MapPin className="h-4 w-4" />, l: 'สนามที่จอง', v: booking.courtName, s: booking.sportName },
                { icon: <CalendarDays className="h-4 w-4" />, l: 'วันที่เล่นกีฬา', v: formatThaiDate(booking.bookingDate) },
                {
                  icon: <Clock className="h-4 w-4" />,
                  l: 'ช่วงเวลาที่จอง',
                  v: `${booking.startTime} - ${booking.endTime} น.`,
                  s: `ระยะเวลารวม ${hoursBetween(booking.startTime, booking.endTime)} ชั่วโมง`,
                },
              ].map((x) => (
                <div key={x.l} className="flex items-start gap-3 rounded-xl bg-panel p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-forest-700">{x.icon}</div>
                  <div>
                    <div className="text-[10px] text-slate-500">{x.l}</div>
                    <div className="text-sm font-semibold text-forest-950">{x.v}</div>
                    {x.s && <div className="text-[10px] text-slate-400">{x.s}</div>}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-forest-950">อุปกรณ์ที่ยืมเสริม</h3>
              {booking.equipment && booking.equipment.length > 0 ? (
                <div className="space-y-2">
                  {booking.equipment.map((eq) => (
                    <div key={eq.bookingEquipmentId} className="flex items-center justify-between rounded-xl bg-panel px-4 py-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-forest-600" /> {eq.equipmentName} × {eq.quantity}
                      </span>
                      <span className="font-semibold">{formatTHB(eq.subtotal)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-panel px-4 py-2.5 text-xs text-slate-500">ไม่ได้ยืมอุปกรณ์เสริม</div>
              )}
            </div>
          </div>

          {/* ไทม์ไลน์สถานะ (BR16) */}
          <div className="card space-y-4 p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-forest-950">
              <History className="h-5 w-5" /> ประวัติสถานะการจอง (BOOKING_STATUS_HISTORY)
            </h2>
            <ol className="relative space-y-4 border-l-2 border-slate-100 pl-6">
              {booking.statusHistory?.map((h) => (
                <li key={h.historyId} className="relative">
                  <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-forest-700 ring-2 ring-mint-200" />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={h.status} />
                    <span className="text-[11px] text-slate-400">{formatDateTime(h.createdAt)}</span>
                    {(h as any).changedByName && <span className="text-[11px] text-slate-500">โดย {(h as any).changedByName}</span>}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">{h.notes || 'เปลี่ยนสถานะ'}</div>
                </li>
              ))}
            </ol>
          </div>

          {payments.length > 0 && (
            <div className="card space-y-3 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold text-forest-950">
                <Wallet className="h-5 w-5" /> ประวัติการส่งสลิป (PAYMENTS)
              </h2>
              {payments.map((p: any) => (
                <div key={p.paymentId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel px-4 py-3 text-xs">
                  <div>
                    <div className="font-semibold text-forest-950">
                      #{p.paymentId} • {p.paymentMethod} • Ref {p.slipReference || '-'}
                    </div>
                    <div className="text-slate-500">ส่งเมื่อ {formatDateTime(p.createdAt)}</div>
                    {p.rejectionReason && <div className="text-rose-600">เหตุผลที่ปฏิเสธ: {p.rejectionReason}</div>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{formatTHB(p.amount)}</span>
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card space-y-4 p-6">
            <h2 className="text-lg font-bold text-forest-950">สรุปยอดชำระ</h2>
            <div className="divide-y divide-slate-100">
              <InfoRow label="ค่าบริการสนาม" value={formatTHB(booking.totalCourtFee)} />
              <InfoRow label="ค่าเช่าอุปกรณ์" value={formatTHB(booking.totalEquipmentFee)} />
              {booking.discountAmount > 0 && (
                <InfoRow label={`ส่วนลด ${b.promotionCode ? `(${b.promotionCode})` : ''}`} value={`-${formatTHB(booking.discountAmount)}`} />
              )}
            </div>
            <div className="rounded-2xl bg-panel p-4">
              <div className="text-xs text-slate-500">ยอดสุทธิ</div>
              <div className="text-3xl font-bold text-forest-950">{formatTHB(booking.finalAmount)}</div>
            </div>

            <div className="space-y-2">
              {booking.status === 'PENDING_PAYMENT' && !slipPending && (
                <Link to={`/payment?bookingId=${booking.bookingId}`} className="btn-primary w-full py-3">
                  <Upload className="h-4 w-4" /> อัปโหลดสลิปและชำระ {formatTHB(booking.finalAmount)}
                </Link>
              )}
              {isPaid && (
                <Link to={`/receipt/${booking.bookingId}`} className="btn-mint w-full py-3">
                  <QrCode className="h-4 w-4" /> บัตรผ่านดิจิทัล & ใบเสร็จ
                </Link>
              )}
              {['CONFIRMED', 'PAYMENT_VERIFIED'].includes(booking.status) && (
                <button onClick={handleCheckIn} disabled={isCheckingIn} className="btn-soft w-full">
                  {isCheckingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} เช็คอินเข้าสนาม (BR8)
                </button>
              )}
              {canModify && (
                <button onClick={handleOpenCancelModal} className="btn-danger-soft w-full">
                  <CircleX className="h-4 w-4" /> ยกเลิกการจองและขอคืนเงิน (BR12)
                </button>
              )}
            </div>
          </div>

          <div className="card-soft space-y-2 p-5 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-forest-900">
              <AlertCircle className="h-4 w-4" /> เงื่อนไขระบบ
            </div>
            <div>• BR5: แก้ไขวัน/เวลาได้ก่อนเวลาใช้งานอย่างน้อย 24 ชั่วโมง</div>
            <div>• BR8: เช็คอินได้ก่อนเวลาเริ่มไม่เกิน 30 นาที และต้องชำระเงินแล้ว</div>
            <div>• BR12: ยกเลิกล่วงหน้า &gt; 24 ชม. คืน 100% / 1-24 ชม. คืน 50% / น้อยกว่า 1 ชม. ไม่คืนเงิน (เฉพาะรายการที่ชำระแล้ว)</div>
          </div>
        </div>
      </div>

      {/* แก้ไขการจอง (BR5) */}
      <Modal
        open={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        title={
          <span className="flex items-center gap-2">
            <Pencil className="h-5 w-5" /> แก้ไขวัน/เวลาการจอง (BR5)
          </span>
        }
      >
        <div className="space-y-4">
          {updateError && <Alert tone="error" title={updateError} />}
          <div>
            <label className="label">วันที่ใหม่</label>
            <input type="date" className="input" value={updateDate} onChange={(e) => setUpdateDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">เวลาเริ่ม</label>
              <input type="time" className="input" value={updateStartTime} onChange={(e) => setUpdateStartTime(e.target.value)} />
            </div>
            <div>
              <label className="label">เวลาสิ้นสุด</label>
              <input type="time" className="input" value={updateEndTime} onChange={(e) => setUpdateEndTime(e.target.value)} />
            </div>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            การแก้ไขต้องทำล่วงหน้าอย่างน้อย 24 ชั่วโมงก่อนเวลาเริ่มใช้งานเดิม และช่วงเวลาใหม่ต้องว่าง (BR2)
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={() => setShowUpdateModal(false)} className="btn-outline">
              ยกเลิก
            </button>
            <button onClick={handleConfirmUpdate} disabled={isSubmittingUpdate} className="btn-primary">
              {isSubmittingUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ยืนยันการแก้ไข
            </button>
          </div>
        </div>
      </Modal>

      {/* ยกเลิกและคืนเงิน (BR12) */}
      <Modal
        open={showCancelModal && !!cancelPreview}
        onClose={() => setShowCancelModal(false)}
        title={
          <span className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> ยกเลิกการจองและคำนวณเงินคืน (BR12)
          </span>
        }
      >
        {cancelPreview && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl bg-panel p-4 text-sm">
              <InfoRow label="ยอดการจอง" value={formatTHB(cancelPreview.totalPrice)} />
              <InfoRow label="เวลาก่อนเริ่มใช้สนาม" value={`${cancelPreview.hoursUntilStart.toFixed(1)} ชั่วโมง`} />
              <InfoRow label="อัตราคืนเงิน" value={`${cancelPreview.refundPercentage}%`} />
              <div className="flex items-end justify-between border-t border-white pt-2">
                <span className="font-semibold">ยอดเงินคืนโดยประมาณ</span>
                <span className="text-2xl font-bold text-forest-700">{formatTHB(cancelPreview.refundAmount)}</span>
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{cancelPreview.message}</div>
            <div>
              <label className="label">เหตุผลการยกเลิก (ไม่บังคับ)</label>
              <textarea className="input h-20 resize-none" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="กรุณาระบุเหตุผล..." />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={() => setShowCancelModal(false)} className="btn-outline">
                ปิด
              </button>
              <button onClick={handleConfirmCancel} disabled={isSubmittingCancel} className="btn-danger">
                {isSubmittingCancel ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ยืนยันการยกเลิก
              </button>
            </div>
          </div>
        )}
      </Modal>
    </CustomerLayout>
  );
};
