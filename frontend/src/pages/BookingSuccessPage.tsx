import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getBookingByIdApi } from '../services/booking';
import { useAuth } from '../context/AuthContext';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import {
  CountdownBanner,
  InfoRow,
  LoadingState,
  StatusBadge,
  Stepper,
  formatTHB,
  formatThaiDate,
  hoursBetween,
} from '../components/ui';
import { ArrowRight, CalendarDays, CheckCircle2, Clock, LogIn, MapPin, Package, Pencil, Phone, ReceiptText, ShieldCheck, Undo2, X } from 'lucide-react';
import { BRAND_NAME } from '../config/brand';

// UCS-3.3 ยืนยันการจองและนับเวลาถอยหลัง 15 นาที (ขั้นตอนที่ 3 จาก 4)
export const BookingSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('bookingId') || '1';
  const bookingCode = searchParams.get('code') || 'BK-SUCCESS';
  const { user } = useAuth();

  const { data: booking, isLoading } = useQuery({
    queryKey: ['bookingDetail', Number(bookingId)],
    queryFn: () => getBookingByIdApi(Number(bookingId)),
    refetchInterval: 15000,
  });
  const b: any = booking;
  const isPending = booking?.status === 'PENDING_PAYMENT';
  const hours = booking ? hoursBetween(booking.startTime, booking.endTime) : 0;

  return (
    <CustomerLayout
      banner={
        <div className="border-b border-mint-200 bg-mint-100">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 text-sm text-forest-900 sm:px-6 lg:px-8">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> สร้างรายการจองชั่วคราวสำเร็จ! ล็อกโควตาสนามและอุปกรณ์เรียบร้อยแล้ว (Draft Status)
            </span>
            {booking && <StatusBadge status={booking.status} />}
          </div>
        </div>
      }
    >
      <Stepper current={3} />

      {isPending && <CountdownBanner expiresAt={b?.holdExpiresAt} />}
      {booking?.status === 'EXPIRED' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <strong>หมดเวลาชำระเงิน:</strong> การจองนี้ถูกยกเลิกอัตโนมัติและคืนสนาม/อุปกรณ์เข้าสู่ระบบแล้ว กรุณาทำรายการจองใหม่
        </div>
      )}

      {isLoading ? (
        <LoadingState label="กำลังโหลดรายการจอง..." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <div className="card space-y-6 p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-900 text-mint-300">
                    <ReceiptText className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">รหัสอ้างอิงการจอง (Booking Draft ID)</div>
                    <div className="font-mono text-2xl font-bold text-forest-950">#{booking?.bookingNumber || bookingCode}</div>
                  </div>
                </div>
                {booking && <StatusBadge status={booking.status} />}
              </div>

              <div className="card-soft p-5">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-forest-700">ข้อมูลผู้จอง (Member Details)</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] text-slate-500">ชื่อ-นามสกุล สมาชิก</div>
                    <div className="text-lg font-semibold text-forest-950">
                      คุณ{user?.firstName} {user?.lastName}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-forest-700">
                      <ShieldCheck className="h-3.5 w-3.5" /> สมาชิกสถานะปกติ (Active Member)
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">หมายเลขโทรศัพท์ติดต่อ</div>
                    <div className="text-lg font-semibold text-forest-950">{user?.phone || '-'}</div>
                    <div className="text-[11px] text-slate-500">อีเมล: {user?.email}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-forest-950">รายละเอียดการจองสนาม (Court Booking)</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: <MapPin className="h-4 w-4" />, label: 'สนามที่จอง', value: booking?.courtName, sub: booking?.sportName },
                    { icon: <CalendarDays className="h-4 w-4" />, label: 'วันที่เล่นกีฬา', value: formatThaiDate(booking?.bookingDate), sub: 'จองล่วงหน้าได้ไม่เกิน 30 วัน' },
                    { icon: <Clock className="h-4 w-4" />, label: 'ช่วงเวลาที่จอง', value: `${booking?.startTime || ''} - ${booking?.endTime || ''} น.`, sub: `ระยะเวลารวม ${hours} ชั่วโมง` },
                  ].map((x) => (
                    <div key={x.label} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-700">{x.icon}</div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-slate-500">{x.label}</div>
                        <div className="text-sm font-semibold text-forest-950">{x.value || '-'}</div>
                        <div className="text-[10px] text-slate-400">{x.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-base font-semibold text-forest-950">รายการอุปกรณ์ที่ยืมเสริม (Equipment Rental)</h3>
                {booking?.equipment && booking.equipment.length > 0 ? (
                  <div className="space-y-2">
                    {booking.equipment.map((e) => (
                      <div key={e.bookingEquipmentId} className="flex items-center justify-between rounded-xl bg-panel px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-forest-700">
                            <Package className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-forest-950">{e.equipmentName}</div>
                            <div className="text-[11px] text-slate-500">รหัสอุปกรณ์: EQ-{e.equipmentId} • จำนวน {e.quantity} ชิ้น</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-forest-950">{formatTHB(e.subtotal)}</div>
                          <div className="text-[10px] text-slate-500">(@{formatTHB(e.unitRentalFee, 0)}/ชิ้น)</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-panel px-4 py-3 text-xs text-slate-500">ไม่ได้ยืมอุปกรณ์เสริม</div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-mint-50 p-4 text-xs text-forest-900">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <LogIn className="h-4 w-4" /> เงื่อนไขการเช็คอิน
                  </div>
                  สามารถเช็คอินเข้าใช้สนามได้ก่อนเวลาเริ่มไม่เกิน 30 นาที โดยแสดง QR Code / รหัสการจองต่อเจ้าหน้าที่ที่เคาน์เตอร์
                </div>
                <div className="rounded-xl bg-sky-50 p-4 text-xs text-sky-900">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <Undo2 className="h-4 w-4" /> เงื่อนไขการยกเลิกคืนเงิน
                  </div>
                  ยกเลิกล่วงหน้ามากกว่า 24 ชั่วโมง ได้รับเงินคืนเต็มจำนวน 100% | ยกเลิกน้อยกว่า 24 ชั่วโมง คืนเงิน 50%
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card space-y-4 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-forest-950">สรุปยอดชำระ</h2>
                <span className="badge-mint">THB Currency</span>
              </div>
              <div className="divide-y divide-slate-100">
                <InfoRow label={`ค่าบริการสนาม (${hours} ชม.)`} value={formatTHB(booking?.totalCourtFee)} />
                <InfoRow label="ค่าเช่าอุปกรณ์กีฬา" value={formatTHB(booking?.totalEquipmentFee)} />
                <InfoRow label="ยอดรวมก่อนหักส่วนลด" value={formatTHB((booking?.totalCourtFee || 0) + (booking?.totalEquipmentFee || 0))} />
              </div>
              {(booking?.discountAmount || 0) > 0 && (
                <div className="flex justify-between rounded-xl bg-mint-50 px-3 py-2 text-sm font-semibold text-forest-800">
                  <span>ส่วนลดสมาชิก/โปรโมชั่น {b?.promotionCode ? `(${b.promotionCode})` : ''}</span>
                  <span>-{formatTHB(booking?.discountAmount)}</span>
                </div>
              )}
              <div className="rounded-2xl bg-panel p-5">
                <div className="text-xs font-semibold text-slate-600">ยอดสุทธิที่ต้องชำระ (TOTAL PAYABLE)</div>
                <div className="mt-1 flex items-end justify-between">
                  <span className="text-4xl font-bold text-forest-950">{(booking?.finalAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                  <span className="text-sm text-slate-600">บาท (THB)</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500">ยอดเงินในสลิปต้องตรงกับยอดนี้</div>
              </div>

              {isPending ? (
                <Link to={`/payment/${bookingId}`} className="btn-primary w-full py-3.5">
                  ดำเนินการชำระเงิน / อัปโหลดสลิป <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link to={`/my-bookings/${bookingId}`} className="btn-primary w-full py-3.5">
                  ดูรายละเอียดการจอง <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Link to={`/my-bookings/${bookingId}`} className="btn-soft">
                  <Pencil className="h-4 w-4" /> แก้ไขรายการ
                </Link>
                <Link to={`/my-bookings/${bookingId}`} className="btn-soft">
                  <X className="h-4 w-4" /> ยกเลิกรายการนี้
                </Link>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-mint-600" /> ข้อมูลทั้งหมดบันทึกในระบบ {BRAND_NAME}
              </div>
            </div>

            <div className="card-soft flex items-center gap-3 p-4 text-xs text-slate-600">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-forest-700">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold text-forest-950">มีข้อสงสัยเกี่ยวกับรายการจอง?</div>
                ติดต่อเจ้าหน้าที่เคาน์เตอร์สนาม ทุกวัน 08:00 - 22:00 น.
              </div>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
};
