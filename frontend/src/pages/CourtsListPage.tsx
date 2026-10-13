import React, { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getCourtAvailabilityApi, getCourtsApi, getSportsApi } from '../services/court';
import { CourtCard } from '../components/CourtCard';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import { EmptyState, LoadingState, PageHeader, RuleCard, addDaysISO, formatThaiDate, sportLabel, todayISO } from '../components/ui';
import { CalendarDays, Clock4, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Timer, Wallet } from 'lucide-react';

const PERIODS = [
  { key: 'morning', label: 'ช่วงเช้า', range: '08:00 - 12:00', from: '08:00', to: '12:00' },
  { key: 'afternoon', label: 'ช่วงบ่าย', range: '12:00 - 17:00', from: '12:00', to: '17:00' },
  { key: 'evening', label: 'ช่วงค่ำ', range: '17:00 - 22:00', from: '17:00', to: '22:00' },
] as const;

// UCS-2.1 ค้นหาสนามกีฬาตามประเภท + UCS-2.3 กรองตามวันที่/เวลา
export const CourtsListPage: React.FC = () => {
  const today = todayISO();
  const maxDate = addDaysISO(today, 30); // BR4: จองล่วงหน้าได้ไม่เกิน 30 วัน

  const [selectedSport, setSelectedSport] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState(today);
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number>(600);
  const [sortBy, setSortBy] = useState<'slots' | 'priceAsc' | 'priceDesc'>('slots');

  const { data: sports = [] } = useQuery({ queryKey: ['sports'], queryFn: getSportsApi });

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ['courts', selectedSport, searchQuery, selectedStatus, maxPrice],
    queryFn: () =>
      getCourtsApi({
        sportTypeId: selectedSport,
        search: searchQuery || undefined,
        status: selectedStatus || undefined,
        maxPrice: maxPrice < 600 ? maxPrice : undefined,
      }),
  });

  // ตารางเวลาว่างจริงของแต่ละสนามในวันที่เลือก
  const availabilityQueries = useQueries({
    queries: courts.map((c) => ({
      queryKey: ['courtAvailability', c.courtId, selectedDate],
      queryFn: () => getCourtAvailabilityApi(c.courtId, selectedDate),
      staleTime: 15_000,
    })),
  });

  const periodDef = PERIODS.find((p) => p.key === period);
  const rows = useMemo(() => {
    const list = courts.map((court, i) => {
      const all = availabilityQueries[i]?.data?.slots || [];
      const slots = periodDef ? all.filter((s) => s.startTime >= periodDef.from && s.endTime <= periodDef.to) : all;
      return { court, slots, free: slots.filter((s) => s.status === 'AVAILABLE').length };
    });
    return list.sort((a, b) =>
      sortBy === 'slots' ? b.free - a.free : sortBy === 'priceAsc' ? a.court.hourlyRate - b.court.hourlyRate : b.court.hourlyRate - a.court.hourlyRate
    );
  }, [courts, availabilityQueries, periodDef, sortBy]);

  const periodFreeCount = (p: (typeof PERIODS)[number]) =>
    courts.reduce((sum, _c, i) => {
      const slots = availabilityQueries[i]?.data?.slots || [];
      return sum + slots.filter((s) => s.status === 'AVAILABLE' && s.startTime >= p.from && s.endTime <= p.to).length;
    }, 0);

  const resetFilters = () => {
    setSelectedSport(undefined);
    setSearchQuery('');
    setSelectedStatus(undefined);
    setSelectedDate(today);
    setPeriod(undefined);
    setMaxPrice(600);
  };

  const sportName = sports.find((s) => s.sportTypeId === selectedSport)?.name;

  return (
    <CustomerLayout>
      <PageHeader
        code="UCS-2.1 Booking Matrix"
        eyebrow="อัปเดตสถานะแบบเรียลไทม์จากฐานข้อมูล"
        title="ค้นหาสนามกีฬาและช่วงเวลาว่าง"
        subtitle="ค้นหาคอร์ทมาตรฐาน เลือกช่วงเวลาที่ต้องการ และทำการจองออนไลน์ได้ทันที ปลอดภัย แม่นยำ ไร้การชนซ้ำ (BR2)"
        actions={
          <div className="card-soft flex items-center gap-3 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-forest-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="text-xs">
              <div className="font-semibold text-forest-950">เงื่อนไขการจอง (BR4)</div>
              <div className="text-slate-500">จองล่วงหน้าได้ไม่เกิน 30 วัน</div>
            </div>
          </div>
        }
      />

      {/* ตัวกรองการค้นหาแบบละเอียด (UCS-2.3) */}
      <section className="card space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-forest-950">
            <SlidersHorizontal className="h-5 w-5" /> ตัวกรองการค้นหาแบบละเอียด
          </h2>
          <button onClick={resetFilters} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-forest-700">
            <RotateCcw className="h-3.5 w-3.5" /> ล้างตัวกรองทั้งหมด
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0">ประเภทกีฬา</label>
              <span className="badge-mint">เลือกแล้ว: {selectedSport ? sportLabel(sportName) : 'ทั้งหมด'}</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                className="input pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อสนาม รหัสคอร์ท หรือสถานที่..."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedSport(undefined)}
                className={`badge py-1 ${selectedSport === undefined ? 'bg-forest-900 text-white' : 'bg-panel text-forest-900 hover:bg-forest-100'}`}
              >
                ทั้งหมด
              </button>
              {sports.map((s) => (
                <button
                  key={s.sportTypeId}
                  onClick={() => setSelectedSport(s.sportTypeId)}
                  className={`badge py-1 ${selectedSport === s.sportTypeId ? 'bg-forest-900 text-white' : 'bg-panel text-forest-900 hover:bg-forest-100'}`}
                >
                  {sportLabel(s.name)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0">เลือกวันที่ต้องการใช้งาน</label>
              <span className="text-[11px] text-slate-500">BR4 จองล่วงหน้า 30 วัน</span>
            </div>
            <div className="relative">
              <CalendarDays className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="date"
                className="input pl-10"
                min={today}
                max={maxDate}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value || today)}
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-forest-700">
              <Clock4 className="h-3.5 w-3.5" /> เลือก: {formatThaiDate(selectedDate)}
              {selectedDate === today && ' (วันนี้)'}
            </div>
            <div>
              <label className="label">สถานะสนาม</label>
              <select className="input" value={selectedStatus || ''} onChange={(e) => setSelectedStatus(e.target.value || undefined)}>
                <option value="">ทุกสถานะ</option>
                <option value="AVAILABLE">พร้อมใช้งาน</option>
                <option value="MAINTENANCE">ปิดปรับปรุง</option>
                <option value="CLOSED">ปิดให้บริการ</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="label">ช่วงเวลาที่สะดวกเล่น</label>
            <div className="grid grid-cols-3 gap-2">
              {PERIODS.map((p) => {
                const active = period === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(active ? undefined : p.key)}
                    className={`rounded-xl px-2 py-3 text-center transition ${active ? 'bg-forest-900 text-white shadow-md' : 'bg-panel text-forest-900 hover:bg-forest-100'}`}
                  >
                    <div className="text-sm font-semibold">{p.label}</div>
                    <div className="text-[11px] opacity-80">{p.range}</div>
                    <div className={`mt-1 text-[10px] ${active ? 'text-mint-200' : 'text-forest-600'}`}>ว่าง {periodFreeCount(p)} สล็อต</div>
                  </button>
                );
              })}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label mb-0">ช่วงราคาต่อชั่วโมง</label>
                <span className="text-xs font-semibold text-forest-900">{maxPrice >= 600 ? 'ทุกราคา' : `ไม่เกิน ฿${maxPrice}`}</span>
              </div>
              <input
                type="range"
                min={100}
                max={600}
                step={50}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="mt-3 w-full accent-forest-900"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>฿100</span>
                <span>฿350</span>
                <span>ทุกราคา</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ผลการค้นหา */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-forest-950">
          <span className="h-2.5 w-2.5 rounded-full bg-mint-500" />
          พบทั้งหมด <span className="text-forest-600 underline">{courts.length} คอร์ท</span>
          {selectedSport ? `สำหรับ${sportLabel(sportName)}` : ''}
          <span className="badge-blue">อิงตาม {formatThaiDate(selectedDate, 'short')}</span>
          {periodDef && <span className="badge-mint">{periodDef.label} {periodDef.range}</span>}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">จัดเรียง:</span>
          <select className="input w-auto py-2" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="slots">ว่างมากที่สุด (Slot Availability)</option>
            <option value="priceAsc">ราคาต่ำ → สูง</option>
            <option value="priceDesc">ราคาสูง → ต่ำ</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="กำลังค้นหาสนามจากฐานข้อมูล..." />
      ) : courts.length === 0 ? (
        <EmptyState
          title="ไม่พบสนามที่ตรงกับเงื่อนไข"
          description="ลองปรับประเภทกีฬา ช่วงราคา หรือล้างตัวกรองเพื่อดูสนามทั้งหมด"
          action={
            <button onClick={resetFilters} className="btn-soft">
              ล้างตัวกรอง
            </button>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ court, slots }) => (
            <CourtCard key={court.courtId} court={court} slots={slots} date={selectedDate} />
          ))}
        </div>
      )}

      {/* ระเบียบการจองสนาม (Static text) */}
      <section className="card-soft grid gap-4 p-6 lg:grid-cols-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-forest-900 text-mint-300">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-forest-950">ระเบียบและเงื่อนไขการจองสนาม</h3>
            <p className="text-xs text-slate-500">เพื่อความเป็นระเบียบและสิทธิประโยชน์ที่เท่าเทียมของสมาชิก Barbie Sports Arena ทุกท่าน</p>
          </div>
        </div>
        <RuleCard code="BR3" title="ชำระเงินใน 15 นาที" icon={<Timer className="h-4 w-4" />}>
          ระบบ Hold คอร์ทให้ 15 นาที หากไม่ชำระและส่งสลิปจะคืนสล็อตสู่สาธารณะอัตโนมัติ
        </RuleCard>
        <RuleCard code="BR4" title="สิทธิ์จอง" icon={<CalendarDays className="h-4 w-4" />}>
          จองล่วงหน้าได้ไม่เกิน 30 วัน
        </RuleCard>
        <RuleCard code="BR12" title="ยกเลิก/คืนเงิน" icon={<Wallet className="h-4 w-4" />}>
          ยกเลิกล่วงหน้ามากกว่า 24 ชม. รับเงินคืน 100% / 1-24 ชม. รับคืน 50% / น้อยกว่า 1 ชม. ไม่คืนเงิน
        </RuleCard>
      </section>
    </CustomerLayout>
  );
};
