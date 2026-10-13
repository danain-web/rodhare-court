import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCourtByIdApi } from '../services/court';
import { getEquipmentApi, validatePromotionApi, calculatePriceApi, createBookingApi } from '../services/booking';
import { Promotion } from '../types/booking';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import { Alert, Breadcrumb, Stepper, formatTHB, formatThaiDate, sportLabel, todayISO, addDaysISO } from '../components/ui';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  MapPin,
  Minus,
  Package,
  Percent,
  Plus,
  ShieldCheck,
  Tag,
} from 'lucide-react';

const HOURS_START = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const HOURS_END = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

// UCS-3.1 รายละเอียดสนามและเลือกยืมอุปกรณ์ (ขั้นตอนที่ 2 จาก 4)
export const CreateBookingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const courtId = parseInt(searchParams.get('courtId') || '1', 10);
  const initialDate = searchParams.get('date') || todayISO();
  const initialSlot = searchParams.get('slot') || '10:00-11:00';

  const [bookingDate, setBookingDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialSlot.split('-')[0] || '10:00');
  const [endTime, setEndTime] = useState(initialSlot.split('-')[1] || '11:00');

  // Equipment Quantities Map { equipmentId: quantity }
  const [equipmentQty, setEquipmentQty] = useState<{ [id: number]: number }>({});
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<Promotion | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: court } = useQuery({
    queryKey: ['courtDetail', courtId],
    queryFn: () => getCourtByIdApi(courtId),
  });

  const { data: equipmentList = [] } = useQuery({
    queryKey: ['equipment', court?.sportTypeId],
    queryFn: () => getEquipmentApi(court?.sportTypeId),
    enabled: !!court,
  });

  // Calculate live pricing breakdown
  const equipmentItemsPayload = Object.entries(equipmentQty)
    .filter(([_, qty]) => qty > 0)
    .map(([id, qty]) => ({ equipmentId: parseInt(id, 10), quantity: qty }));

  const {
    data: priceBreakdown,
    refetch: refetchPrice,
    error: priceError,
  } = useQuery({
    queryKey: ['priceCalc', courtId, bookingDate, startTime, endTime, equipmentItemsPayload, appliedPromo?.code],
    queryFn: () =>
      calculatePriceApi({
        courtId,
        bookingDate,
        startTime,
        endTime,
        equipmentItems: equipmentItemsPayload,
        promotionCode: appliedPromo?.code,
      }),
    enabled: !!court && startTime < endTime,
    retry: false,
  });

  useEffect(() => {
    refetchPrice();
  }, [equipmentQty, bookingDate, startTime, endTime, appliedPromo]);

  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) return;
    setPromoError(null);
    try {
      const promo = await validatePromotionApi(promoCodeInput.trim());
      setAppliedPromo(promo);
      setPromoCodeInput('');
    } catch (err: any) {
      setPromoError(err.response?.data?.message || 'Invalid promotion code');
    }
  };

  const handleEquipmentChange = (eqId: number, delta: number, maxQty: number) => {
    setEquipmentQty((prev) => {
      const current = prev[eqId] || 0;
      const next = Math.max(0, Math.min(maxQty, current + delta));
      return { ...prev, [eqId]: next };
    });
  };

  const handleConfirmBooking = async () => {
    setRejectionError(null);
    setIsSubmitting(true);
    try {
      const booking = await createBookingApi({
        courtId,
        bookingDate,
        startTime,
        endTime,
        equipmentItems: equipmentItemsPayload,
        promotionCode: appliedPromo?.code,
      });

      navigate(`/booking/success?bookingId=${booking.bookingId}&code=${booking.bookingNumber}`);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Booking submission failed';
      setRejectionError(msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const pb: any = priceBreakdown;
  const priceErrMsg = (priceError as any)?.response?.data?.message;
  const hours = Math.max(0, parseInt(endTime) - parseInt(startTime));

  return (
    <CustomerLayout>
      <Breadcrumb
        items={[
          { label: 'ค้นหาสนาม', to: '/courts' },
          { label: court?.name || 'สนาม', to: `/courts/${courtId}` },
          { label: 'เลือกอุปกรณ์และยืนยัน' },
        ]}
      />

      <section className="card space-y-5 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">กระบวนการจองคอร์ทกีฬา</div>
            <h1 className="text-2xl font-bold text-forest-950 md:text-3xl">รายละเอียดสนามและยืมอุปกรณ์กีฬา</h1>
          </div>
          <span className="badge-slate py-1.5">
            <Clock className="h-3.5 w-3.5" /> ระบบจะล็อกสนามให้ 15 นาทีหลังกดยืนยันการจอง
          </span>
        </div>
        <Stepper current={2} />
      </section>

      {rejectionError && (
        <Alert tone="error" title="การจองถูกปฏิเสธ (Booking Rejected)" onClose={() => setRejectionError(null)}>
          <div className="text-sm font-medium">{rejectionError}</div>
          <div className="mt-1 text-xs opacity-80">กรุณาตรวจสอบวัน-เวลา จำนวนอุปกรณ์ หรือโค้ดโปรโมชั่น แล้วทำรายการใหม่อีกครั้ง</div>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* ซ้าย: สนาม + วันเวลา + โปรโมชั่น */}
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="relative h-56 bg-forest-900">
              {court?.imageUrl && <img src={court.imageUrl} alt={court.name} className="absolute inset-0 h-full w-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/40 to-transparent" />
              <div className="absolute left-4 top-4 flex gap-2">
                <span className="badge bg-white/90 text-forest-900">{sportLabel(court?.sportName)}</span>
                <span className="badge bg-white/20 text-white backdrop-blur">{court?.code}</span>
              </div>
              <div className="absolute inset-x-5 bottom-4 flex items-end justify-between text-white">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-mint-200">Premium Court</div>
                  <div className="text-2xl font-bold md:text-3xl">{court?.name || 'กำลังโหลด...'}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-white/80">
                    <MapPin className="h-3.5 w-3.5" /> {court?.locationDetails || 'Barbie Sports Arena'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/70">อัตราค่าบริการ</div>
                  <span className="text-2xl font-bold text-mint-300">{formatTHB(court?.hourlyRate, 0)}</span>
                  <span className="text-xs"> / ชั่วโมง</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <h2 className="flex items-center gap-2 text-base font-bold text-forest-950">
                <CalendarDays className="h-5 w-5" /> วันและช่วงเวลาที่จอง
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label">วันที่เล่น (ล่วงหน้าไม่เกิน 30 วัน)</label>
                  <input
                    type="date"
                    className="input"
                    min={todayISO()}
                    max={addDaysISO(todayISO(), 30)}
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">เวลาเริ่ม</label>
                  <select className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                    {HOURS_START.map((h) => {
                      const t = `${h.toString().padStart(2, '0')}:00`;
                      return (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="label">เวลาสิ้นสุด</label>
                  <select className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                    {HOURS_END.map((h) => {
                      const t = `${h.toString().padStart(2, '0')}:00`;
                      return (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="badge-mint">{formatThaiDate(bookingDate)}</span>
                <span className="badge-blue">
                  {startTime} - {endTime} น. ({hours} ชม.)
                </span>              </div>
            </div>
          </div>

          {/* โปรโมชั่น */}
          <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-rose-900 to-rose-950 p-6 text-white shadow-lg">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Percent className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <div className="font-semibold">โค้ดส่วนลดและโปรโมชั่น</div>
                  <div className="text-xs text-white/70">
                    ใช้ได้เฉพาะช่วงวันที่และเวลาที่กำหนด — ส่วนลดตามประเภทสมาชิกจะถูกคำนวณให้อัตโนมัติ
                  </div>
                </div>
                {appliedPromo ? (
                  <div className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-3 text-sm">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-mint-300" />
                      ใช้โค้ด <strong>{appliedPromo.code}</strong> ({appliedPromo.title})
                    </span>
                    <button onClick={() => setAppliedPromo(null)} className="text-xs text-rose-200 underline">
                      นำออก
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-3 h-4 w-4 text-rose-300" />
                      <input
                        className="w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/50 focus:bg-white/20"
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value)}
                        placeholder="เช่น WELCOME10, DISCOUNT50, MORNING20"
                      />
                    </div>
                    <button type="button" onClick={handleApplyPromo} className="btn bg-white text-rose-900 hover:bg-rose-50">
                      ใช้โค้ด
                    </button>
                  </div>
                )}
                {promoError && <div className="rounded-lg bg-white/10 px-3 py-2 text-xs text-rose-100">{promoError}</div>}
              </div>
            </div>
          </div>

          <div className="card-soft space-y-2 p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-forest-950">
              <ShieldCheck className="h-4 w-4" /> ข้อกำหนดการใช้สนามตามระเบียบ
            </h3>
            {[
              'ต้องเป็นสมาชิกสถานะปกติและเข้าสู่ระบบก่อนจองสนาม',
              'ระบบตรวจการจองทับซ้อนแบบ Real-time — ช่วงเวลาที่ถูกจองแล้วจะไม่สามารถจองซ้ำได้',
              'จองล่วงหน้าได้ไม่เกิน 30 วัน',
              'เช็คอินเข้าสนามได้ก่อนเวลาเริ่มไม่เกิน 30 นาที',
            ].map((t) => (
              <div key={t} className="flex items-start gap-2 text-xs text-slate-600">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-600" /> {t}
              </div>
            ))}
          </div>
        </div>

        {/* ขวา: อุปกรณ์ + สรุปราคา */}
        <div className="space-y-6">
          <div className="card space-y-4 p-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="eyebrow">บริการเสริม (Add-on Services)</div>
                <h2 className="text-lg font-bold text-forest-950">ยืมอุปกรณ์กีฬาเพิ่มเติม (ตัดสต็อกอัตโนมัติ)</h2>
                <p className="text-xs text-slate-500">เลือกอุปกรณ์ที่ต้องการ เจ้าหน้าที่จะจัดเตรียมไว้ให้ที่ช่องเช็คอิน</p>
              </div>
              <span className="badge-mint shrink-0">Real-time Stock</span>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-panel p-3 text-xs text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                <strong>ข้อควรทราบ:</strong> การส่งคืนอุปกรณ์ช้ากว่ากำหนดคิดค่าปรับ 20 บาท/15 นาที/ชิ้น
              </span>
            </div>

            {equipmentList.length === 0 ? (
              <div className="rounded-xl bg-panel p-4 text-center text-xs text-slate-500">ไม่มีอุปกรณ์ให้เช่าสำหรับกีฬาประเภทนี้</div>
            ) : (
              <div className="space-y-3">
                {equipmentList.map((eq) => {
                  const qty = equipmentQty[eq.equipmentId] || 0;
                  return (
                    <div key={eq.equipmentId} className={`flex items-center gap-3 rounded-xl p-3 transition ${qty > 0 ? 'bg-mint-50 ring-1 ring-mint-200' : 'bg-panel'}`}>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-forest-700">
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-forest-950">{eq.name}</div>
                        <div className="text-xs text-slate-500">{formatTHB(eq.rentalFee, 0)} / ชิ้น</div>
                        <div className={`text-[11px] ${eq.availableQuantity > 0 ? 'text-forest-600' : 'text-rose-600'}`}>
                          ● เหลือ {eq.availableQuantity} ชิ้นในคลัง
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEquipmentChange(eq.equipmentId, -1, eq.availableQuantity)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-forest-900 hover:bg-forest-100 disabled:opacity-40"
                          disabled={qty === 0}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-6 text-center font-bold">{qty}</span>
                        <button
                          onClick={() => handleEquipmentChange(eq.equipmentId, 1, eq.availableQuantity)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-forest-900 hover:bg-forest-100 disabled:opacity-40"
                          disabled={qty >= eq.availableQuantity}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card-dark sticky top-24 space-y-5 p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] text-mint-300">ใบสรุปคำสั่งจอง</div>
                <h2 className="text-xl font-bold text-white">สรุปรายการคำนวณราคา</h2>
              </div>
              <span className="badge bg-white/10 text-white">สรุปรายการจอง</span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="flex items-center gap-2 text-white/70">
                  <CalendarDays className="h-4 w-4" /> วันเวลาที่จอง
                </span>
                <span className="text-right font-semibold">
                  {formatThaiDate(bookingDate, 'short')} | {startTime}-{endTime} ({pb?.durationHours ?? hours} ชม.)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">ค่าสนาม ({court?.code})</span>
                <span className="font-semibold">{formatTHB(pb?.courtFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">อุปกรณ์เสริม</span>
                <span className="font-semibold">{formatTHB(pb?.equipmentFee)}</span>
              </div>
              {(pb?.equipmentDetails || []).map((e: any) => (
                <div key={e.equipmentId} className="flex justify-between pl-4 text-xs text-mint-200">
                  <span>
                    {e.equipmentName} × {e.quantity}
                  </span>
                  <span>{formatTHB(e.subtotal)}</span>
                </div>
              ))}
              {pb?.memberDiscount > 0 && (
                <div className="flex justify-between text-mint-300">
                  <span>ส่วนลดตามประเภทสมาชิก</span>
                  <span>-{formatTHB(pb.memberDiscount)}</span>
                </div>
              )}
              {pb?.promotionDiscount > 0 && (
                <div className="flex justify-between text-mint-300">
                  <span>ส่วนลดโปรโมชั่น {appliedPromo?.code}</span>
                  <span>-{formatTHB(pb.promotionDiscount)}</span>
                </div>
              )}
              {!pb?.memberDiscount && !pb?.promotionDiscount && pb?.discountAmount > 0 && (
                <div className="flex justify-between text-mint-300">
                  <span>ส่วนลด</span>
                  <span>-{formatTHB(pb.discountAmount)}</span>
                </div>
              )}
            </div>

            {priceErrMsg && <div className="rounded-xl bg-rose-500/20 px-3 py-2 text-xs text-rose-100">{priceErrMsg}</div>}

            <div className="flex items-end justify-between border-t border-white/10 pt-4">
              <div>
                <div className="text-xs font-semibold">ยอดสุทธิที่ต้องชำระ</div>
                <div className="text-[10px] text-white/60">ยอดเงินในสลิปต้องตรงกับยอดนี้</div>
              </div>
              <div className="text-4xl font-bold text-mint-300">
                {(pb?.finalAmount ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                <span className="ml-1 text-base text-white">บาท</span>
              </div>
            </div>

            <button onClick={handleConfirmBooking} disabled={isSubmitting} className="btn-mint w-full py-4 text-base">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> กำลังสร้างรายการจอง...
                </>
              ) : (
                <>
                  ยืนยันการจองและไปขั้นตอนสรุป <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/60">
              <ShieldCheck className="h-3.5 w-3.5" /> ระบบจะล็อกช่วงเวลาและสต็อกอุปกรณ์ให้คุณ 15 นาทีเพื่อชำระเงิน
            </div>
          </div>

          <Link to={`/courts/${courtId}`} className="btn-soft w-full">
            <ArrowLeft className="h-4 w-4" /> กลับไปเลือกช่วงเวลา
          </Link>
        </div>
      </div>
    </CustomerLayout>
  );
};
