import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCourtByIdApi, getCourtAvailabilityApi } from '../services/court';
import { getEquipmentApi } from '../services/booking';
import { useAuth } from '../context/AuthContext';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import {
  Alert,
  Breadcrumb,
  EmptyState,
  LoadingState,
  StatusBadge,
  addDaysISO,
  formatTHB,
  formatThaiDate,
  sportLabel,
  todayISO,
} from '../components/ui';
import { AvailabilitySlot } from '../types/court';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Droplets,
  ImageOff,
  Info,
  Lock,
  MapPin,
  ParkingSquare,
  RefreshCw,
  ShieldAlert,
  ShowerHead,
  Timer,
  Wifi,
  Wind,
} from 'lucide-react';

const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// UCS-2.4 รายละเอียด/ค่าบริการ + UCS-2.2 ดูตารางเวลาว่างแบบ Real-Time
export const CourtDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const courtId = parseInt(id || '1', 10);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const today = todayISO();
  const [selectedDate, setSelectedDate] = useState<string>(searchParams.get('date') || today);
  const [selected, setSelected] = useState<string[]>([]); // startTime ของสล็อตที่เลือก (ต่อเนื่องกัน)
  const [imgError, setImgError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: court, isLoading: isLoadingCourt } = useQuery({
    queryKey: ['courtDetail', courtId],
    queryFn: () => getCourtByIdApi(courtId),
  });

  const {
    data: availability,
    isLoading: isLoadingAvailability,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['courtAvailability', courtId, selectedDate],
    queryFn: () => getCourtAvailabilityApi(courtId, selectedDate),
    refetchInterval: 15000,
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment', court?.sportTypeId],
    queryFn: () => getEquipmentApi(court?.sportTypeId),
    enabled: !!court,
  });

  const slots: AvailabilitySlot[] = availability?.slots || [];
  const selectedSlots = useMemo(() => slots.filter((s) => selected.includes(s.startTime)), [slots, selected]);
  const range = selectedSlots.length
    ? { start: selectedSlots[0].startTime, end: selectedSlots[selectedSlots.length - 1].endTime }
    : null;

  const changeDate = (d: string) => {
    if (d < today) return;
    setSelectedDate(d);
    setSelected([]);
    setNotice(null);
  };

  // เลือกได้เฉพาะช่วงต่อเนื่องกัน (ไม่จำกัดจำนวนชั่วโมง)
  const toggleSlot = (slot: AvailabilitySlot) => {
    setNotice(null);
    if (slot.status !== 'AVAILABLE') return;
    if (selected.includes(slot.startTime)) {
      const idx = selectedSlots.findIndex((s) => s.startTime === slot.startTime);
      // เอาออกได้เฉพาะหัวหรือท้ายของช่วง
      if (idx === 0 || idx === selectedSlots.length - 1) setSelected(selected.filter((t) => t !== slot.startTime));
      else setSelected([slot.startTime]);
      return;
    }
    if (!range) return setSelected([slot.startTime]);
    const adjacent = slot.endTime === range.start || slot.startTime === range.end;
    if (!adjacent) return setSelected([slot.startTime]);
    setSelected([...selected, slot.startTime]);
  };

  const handleProceedBooking = () => {
    if (!range) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    navigate(`/booking?courtId=${courtId}&date=${selectedDate}&slot=${range.start}-${range.end}`);
  };

  if (isLoadingCourt) {
    return (
      <CustomerLayout>
        <LoadingState label="กำลังโหลดรายละเอียดสนาม..." />
      </CustomerLayout>
    );
  }

  if (!court) {
    return (
      <CustomerLayout>
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="ไม่พบสนามที่ต้องการ"
          description="รหัสสนามนี้ไม่มีอยู่ในระบบหรือถูกปิดใช้งานแล้ว"
          action={
            <Link to="/courts" className="btn-primary">
              กลับไปหน้าค้นหาสนาม
            </Link>
          }
        />
      </CustomerLayout>
    );
  }

  const dow = (() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  })();
  const todayHours = court.operatingHours.find((h) => h.dayOfWeek === dow);
  const openLabel = todayHours ? (todayHours.isOpen ? `${todayHours.openTime} - ${todayHours.closeTime}` : 'ปิดทำการ') : '08:00 - 22:00';
  const freeCount = slots.filter((s) => s.status === 'AVAILABLE').length;
  const estimate = court.hourlyRate * selectedSlots.length;

  const slotStyle = (slot: AvailabilitySlot, isSel: boolean) => {
    if (isSel) return 'bg-forest-900 text-white ring-4 ring-mint-200 shadow-lg border-b-4 border-mint-400';
    switch (slot.status) {
      case 'AVAILABLE':
        return 'bg-white hover:bg-mint-50 border-b-4 border-mint-500 cursor-pointer';
      case 'PENDING_PAYMENT':
        return 'bg-sky-50 text-sky-700 border-b-4 border-sky-400 cursor-not-allowed';
      case 'OCCUPIED':
        return 'bg-rose-50 text-slate-400 border-b-4 border-rose-400 cursor-not-allowed';
      case 'MAINTENANCE':
        return 'bg-amber-50 text-amber-700 border-b-4 border-amber-400 cursor-not-allowed';
      default:
        return 'bg-slate-100 text-slate-400 border-b-4 border-slate-300 cursor-not-allowed';
    }
  };

  return (
    <CustomerLayout>
      <Breadcrumb items={[{ label: 'ค้นหาสนาม (UCS-2)', to: '/courts' }, { label: court.name }, { label: 'ตารางเวลา Real-Time (UCS-2.2 & 2.4)' }]} />

      {/* Hero + ค่าบริการ (UCS-2.4) */}
      <section className="card grid overflow-hidden lg:grid-cols-[1.4fr_1fr]">
        <div className="relative min-h-80 bg-forest-900">
          {court.imageUrl && !imgError ? (
            <img src={court.imageUrl} alt={court.name} onError={() => setImgError(true)} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-forest-200">
              <ImageOff className="h-12 w-12" /> <span className="text-sm">ยังไม่มีรูปภาพสนาม</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/50 to-forest-950/10" />
          <div className="absolute left-5 top-5 flex flex-wrap gap-2">
            <span className="badge bg-mint-300 text-forest-950">
              <BadgeCheck className="h-3.5 w-3.5" /> {sportLabel(court.sportName)}
            </span>
            <span className="badge bg-white/20 text-white backdrop-blur">รหัส: {court.code}</span>
            <StatusBadge status={court.status} />
          </div>
          <div className="absolute inset-x-6 bottom-6 space-y-2 text-white">
            <div className="flex items-center gap-2 text-xs text-mint-200">
              <MapPin className="h-3.5 w-3.5" /> {court.locationDetails || 'Barbie Sports Arena'}
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">{court.name}</h1>
            <p className="text-sm text-white/80">สนามมาตรฐานพร้อมระบบตรวจสอบสถานะการจองแบบ Real-time จากฐานข้อมูล ไม่มีการจองซ้อน (BR2)</p>
          </div>
        </div>

        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-500">อัตราค่าบริการมาตรฐาน</div>
              <div className="text-4xl font-bold text-forest-950">
                {formatTHB(court.hourlyRate, 0).replace('฿', '')}
                <span className="ml-1 text-sm font-medium text-slate-500">บาท / ชั่วโมง</span>
              </div>
            </div>
            <div className="text-right">
              <span className="badge-mint">เปิดให้บริการวันนี้</span>
              <div className="mt-1 text-[11px] text-slate-500">{openLabel}</div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-slate-600">เวลาเปิด-ปิดรายวัน</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {DAYS.map((day, idx) => {
                const h = court.operatingHours.find((x) => x.dayOfWeek === idx);
                return (
                  <div key={day} className={`flex justify-between rounded-lg px-3 py-1.5 ${idx === dow ? 'bg-mint-100 font-semibold text-forest-900' : 'bg-panel'}`}>
                    <span>{day}</span>
                    <span>{h ? (h.isOpen ? `${h.openTime}-${h.closeTime}` : 'ปิด') : '08:00-22:00'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {court.pricingRates.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-600">อัตราค่าบริการตามช่วงเวลา (PRICING_RATES)</div>
              <div className="space-y-1.5">
                {court.pricingRates.map((r) => (
                  <div key={r.rateId} className="flex justify-between rounded-lg bg-panel px-3 py-1.5 text-xs">
                    <span>
                      {r.dayType === 'WEEKEND' ? 'เสาร์-อาทิตย์' : r.dayType === 'HOLIDAY' ? 'วันหยุด' : 'จันทร์-ศุกร์'} {r.startTime}-{r.endTime}
                    </span>
                    <span className="font-semibold text-forest-900">{formatTHB(r.hourlyRate, 0)}/ชม.</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto flex items-start gap-3 rounded-xl bg-panel p-3 text-[11px] text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" />
            <span>
              <strong className="text-forest-900">ข้อกำหนดสำคัญ (BR1 & BR3):</strong> ต้องเข้าสู่ระบบก่อนจอง และต้องชำระเงินภายใน 15 นาทีหลังสร้างรายการจอง
            </span>
          </div>
        </div>
      </section>

      {/* เลือกวันที่ + คำอธิบายสี (UCS-2.2) */}
      <section className="card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">สถานะสล็อตเวลา:</span>
          <span className="badge bg-panel py-1 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-mint-500" /> ว่าง (Available) - กดเพื่อเลือกจอง
          </span>
          <span className="badge bg-panel py-1 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> รอชำระเงิน (ถือครอง 15 นาที BR3)
          </span>
          <span className="badge bg-panel py-1 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> ถูกจองแล้ว
          </span>
          <span className="badge bg-panel py-1 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> ปิดปรับปรุง
          </span>
          <span className="badge bg-panel py-1 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> นอกเวลาทำการ / ผ่านไปแล้ว
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline px-3" onClick={() => changeDate(addDaysISO(selectedDate, -1))} disabled={selectedDate <= today}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="date"
              className="input w-auto bg-white pl-9"
              min={today}
              max={addDaysISO(today, 30)}
              value={selectedDate}
              onChange={(e) => changeDate(e.target.value || today)}
            />
          </div>
          <button className="btn-outline px-3" onClick={() => changeDate(addDaysISO(selectedDate, 1))} disabled={selectedDate >= addDaysISO(today, 30)}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button className="btn-primary" onClick={() => changeDate(today)}>
            กลับสู่วันนี้
          </button>
        </div>
      </section>

      {/* ผังตารางเวลา (Court Availability Grid) */}
      <section className="card space-y-5 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-forest-950">ผังตารางเวลาประจำวัน (Court Availability Grid)</h2>
            <p className="text-xs text-slate-500">
              {formatThaiDate(selectedDate)} • ว่าง {freeCount} จาก {slots.length} ช่วง • คลิกช่อง "ว่าง" ที่ต่อเนื่องกันเพื่อเลือกช่วงเวลา
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge-mint py-1.5">
              <Clock className="h-3.5 w-3.5" /> เวลาเปิดบริการ: {(availability as any)?.openTime || '08:00'} - {(availability as any)?.closeTime || '22:00'} น.
            </span>
            <button onClick={() => refetch()} className="btn-soft px-3 py-1.5 text-xs" title="อัปเดตอัตโนมัติทุก 15 วินาที">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('th-TH') : ''}
            </button>
          </div>
        </div>

        {notice && <Alert tone="warning" title={notice} onClose={() => setNotice(null)} />}

        {isLoadingAvailability ? (
          <LoadingState label="กำลังตรวจสอบสล็อตว่างแบบ Real-time..." />
        ) : slots.length === 0 ? (
          <EmptyState title="สนามปิดทำการในวันที่เลือก" description="กรุณาเลือกวันอื่น" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
            {slots.map((slot) => {
              const isSel = selected.includes(slot.startTime);
              const order = selectedSlots.findIndex((s) => s.startTime === slot.startTime) + 1;
              return (
                <button
                  key={slot.startTime}
                  disabled={slot.status !== 'AVAILABLE'}
                  onClick={() => toggleSlot(slot)}
                  className={`flex min-h-28 flex-col justify-between rounded-xl p-3 text-left transition ${slotStyle(slot, isSel)}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-sm font-semibold ${slot.status === 'AVAILABLE' || isSel ? '' : 'text-slate-400'}`}>
                      {slot.startTime} - {slot.endTime}
                    </span>
                    {isSel ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mint-300 text-forest-950">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : slot.status === 'AVAILABLE' ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-mint-500" />
                    ) : slot.status === 'OCCUPIED' ? (
                      <Lock className="h-4 w-4 text-rose-400" />
                    ) : slot.status === 'PENDING_PAYMENT' ? (
                      <Timer className="h-4 w-4 text-sky-500" />
                    ) : (
                      <Timer className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className={`text-[11px] ${isSel ? 'text-mint-200' : slot.status === 'OCCUPIED' ? 'text-rose-500' : slot.status === 'PENDING_PAYMENT' ? 'text-sky-600' : 'text-forest-600'}`}>
                      {isSel
                        ? `คุณเลือกช่วงนี้ (${order})`
                        : slot.status === 'AVAILABLE'
                          ? '✓ ว่าง'
                          : slot.status === 'OCCUPIED'
                            ? `ถูกจองแล้ว ${slot.bookingNumber ? `• ${slot.bookingNumber.slice(-6)}` : ''}`
                            : slot.status === 'PENDING_PAYMENT'
                              ? 'รอชำระเงิน'
                            : slot.status === 'MAINTENANCE'
                              ? 'ปิดปรับปรุง'
                              : 'นอกเวลา / ผ่านไปแล้ว'}
                    </div>
                    {(slot.status === 'AVAILABLE' || isSel) && <div className="text-base font-bold">{formatTHB(court.hourlyRate, 0)}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-3 rounded-xl bg-panel p-4 text-xs text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" />
          <div>
            <strong className="text-forest-900">ข้อกำหนดการจองสนาม (Business Rules BR3 & BR4):</strong> เมื่อยืนยันการจอง ระบบจะสงวนสิทธิ์ (Soft Lock)
            ช่วงเวลาไว้ให้ 15 นาทีเพื่อชำระเงิน หากเกินเวลาระบบจะปลดสิทธิ์ให้เป็นสถานะ "ว่าง" โดยอัตโนมัติ และจองล่วงหน้าได้ไม่เกิน 30 วัน
          </div>
        </div>
      </section>

      {/* อุปกรณ์ให้เช่า + สิ่งอำนวยความสะดวก */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-forest-950">อุปกรณ์กีฬาให้เช่าเพิ่มเติม</h2>
            <span className="badge-mint">สต็อกจริงจาก EQUIPMENT</span>
          </div>
          {equipment.length === 0 ? (
            <p className="text-sm text-slate-500">ไม่มีอุปกรณ์ให้เช่าสำหรับสนามประเภทนี้</p>
          ) : (
            <div className="space-y-2">
              {equipment.map((eq) => (
                <div key={eq.equipmentId} className="flex items-center justify-between rounded-xl bg-panel px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-forest-950">{eq.name}</div>
                    <div className="text-[11px] text-forest-600">● คงเหลือ {eq.availableQuantity} / {eq.totalQuantity} ชิ้น</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-forest-950">{formatTHB(eq.rentalFee, 0)}</div>
                    <div className="text-[10px] text-slate-500">ราคาประเมิน {formatTHB(eq.replacementCost, 0)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl bg-rose-50 p-3 text-[11px] text-rose-800">
            <strong>ข้อกำหนดตามกฎระเบียบ BR11:</strong> คืนอุปกรณ์ช้ากว่าเวลาสิ้นสุดการจอง คิดค่าปรับ 20 บาท / 15 นาที / ชิ้น ชำรุดหรือสูญหายคิดตามราคาประเมิน
          </div>
        </div>

        <div className="card space-y-4 p-6">
          <h2 className="text-lg font-bold text-forest-950">สิ่งอำนวยความสะดวกประจำสนาม</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { icon: <Wind className="h-5 w-5" />, t: 'ระบบระบายอากาศ' },
              { icon: <Lock className="h-5 w-5" />, t: 'ล็อกเกอร์' },
              { icon: <Droplets className="h-5 w-5" />, t: 'จุดเติมน้ำดื่ม' },
              { icon: <ShowerHead className="h-5 w-5" />, t: 'ห้องอาบน้ำ' },
              { icon: <ParkingSquare className="h-5 w-5" />, t: 'ที่จอดรถ' },
              { icon: <Wifi className="h-5 w-5" />, t: 'Wi-Fi' },
            ].map((f) => (
              <div key={f.t} className="rounded-xl bg-panel p-4 text-forest-800">
                {f.icon}
                <div className="mt-2 text-xs font-semibold">{f.t}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* แถบสรุปการเลือก (Sticky bottom) */}
      <div className="sticky bottom-4 z-30">
        <div className="card flex flex-col gap-4 p-4 shadow-2xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-forest-900 text-mint-300">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div className="text-xs">
              <div className="flex items-center gap-2 text-sm font-bold text-forest-950">
                {court.name}
                {range && <span className="badge-mint">สล็อตได้รับการยืนยัน</span>}
              </div>
              <div className="text-slate-600">
                {range
                  ? `ช่วงเวลาที่เลือก: ${formatThaiDate(selectedDate)} (${range.start} - ${range.end} น. รวม ${selectedSlots.length} ชม.)`
                  : 'ยังไม่ได้เลือกช่วงเวลา — คลิกช่องสีเขียวด้านบน'}
              </div>
              <div className="text-[11px] text-slate-500">
                เลือกแล้ว {selectedSlots.length} ชม. • <span className="text-amber-600">ล็อกสิทธิ์ 15 นาทีหลังยืนยันการจอง (BR3)</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-slate-500">ค่าสนามเบื้องต้น</div>
              <div className="text-2xl font-bold text-forest-950">
                {estimate.toLocaleString('th-TH')} <span className="text-xs font-normal text-slate-500">บาท</span>
              </div>
            </div>
            <button className="btn-soft" onClick={() => setSelected([])} disabled={!range}>
              ล้างช่วงเวลา
            </button>
            <button className="btn-primary px-5 py-3" onClick={handleProceedBooking} disabled={!range}>
              {isAuthenticated ? 'ดำเนินการเลือกอุปกรณ์และจอง (ถัดไป)' : 'เข้าสู่ระบบเพื่อจอง (BR1)'} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
};
