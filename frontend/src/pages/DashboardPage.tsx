import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getDashboardByRole } from '../services/auth';
import api from '../services/api';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import { StaffLayout } from '../components/layout/StaffLayout';
import { LoadingState, PageHeader, StatCard, formatNumber, formatTHB } from '../components/ui';
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarX,
  CheckCircle,
  ClipboardCheck,
  Compass,
  Dumbbell,
  FileClock,
  Lock,
  Percent,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Shield,
  Tag,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';

// ---------------- กราฟแท่งชุดเดียว (single series) พร้อม tooltip เมื่อชี้ ----------------
const BarList: React.FC<{
  rows: { label: string; value: number; sub?: string }[];
  format?: (v: number) => string;
  emptyText: string;
}> = ({ rows, format = (v) => formatNumber(v), emptyText }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="rounded-xl bg-panel p-6 text-center text-xs text-slate-500">{emptyText}</div>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="group grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-xs" title={`${r.label}: ${format(r.value)}${r.sub ? ` • ${r.sub}` : ''}`}>
          <span className="truncate text-slate-600">{r.label}</span>
          <div className="h-3 rounded-full bg-slate-100">
            <div className="h-3 rounded-full bg-forest-700 transition-all group-hover:bg-forest-900" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 6 : 0 }} />
          </div>
          <span className="min-w-16 text-right font-semibold text-forest-950">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
};

const ColumnChart: React.FC<{ rows: { label: string; value: number; sub?: string }[]; emptyText: string }> = ({ rows, emptyText }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="rounded-xl bg-panel p-6 text-center text-xs text-slate-500">{emptyText}</div>;
  return (
    <div className="relative">
      <div className="flex h-52 items-end gap-2 border-b border-slate-200 px-1">
        {rows.map((r, i) => (
          <div key={r.label} className="relative flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {hover === i && (
              <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-forest-950 px-2.5 py-1.5 text-[11px] text-white shadow-lg">
                <div className="font-semibold">{formatTHB(r.value, 0)}</div>
                <div className="text-white/70">
                  {r.label}
                  {r.sub ? ` • ${r.sub}` : ''}
                </div>
              </div>
            )}
            <div
              className={`rounded-t-[4px] transition-colors ${hover === i ? 'bg-forest-900' : 'bg-forest-600'}`}
              style={{ height: `${(r.value / max) * 100}%`, minHeight: r.value ? 4 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 px-1">
        {rows.map((r) => (
          <div key={r.label} className="flex-1 truncate text-center text-[10px] text-slate-500">
            {r.label.slice(5)}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------- UCS-9 รายงานผู้บริหาร (BR17) ----------------
const ExecutiveReport: React.FC<{ data: any }> = ({ data }) => {
  const total = data.confirmedBookings + data.cancelledBookings;
  const cancelRate = data.totalBookingsThisMonth ? Math.round((data.cancelledBookings / data.totalBookingsThisMonth) * 100) : 0;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="รายได้สุทธิเดือนนี้ (NET REVENUE MTD)"
          value={formatTHB(data.netRevenue ?? data.monthlyRevenue)}
          icon={<TrendingUp className="h-5 w-5" />}
          footer={`รับชำระ ${formatTHB(data.monthlyRevenue)} • คืนเงิน ${formatTHB(data.refundedThisMonth)}`}
        />
        <StatCard
          label="อัตราครองสนาม (UTILIZATION)"
          value={data.courtUtilizationRate}
          icon={<Percent className="h-5 w-5" />}
          tone="blue"
          footer={`ชั่วโมงที่ถูกใช้ ${data.bookedHoursThisMonth ?? 0} ชม. เทียบเวลาเปิดทำการทั้งเดือน`}
        />
        <StatCard
          label="ยอดเงินคืนสะสม (BR12 REFUND)"
          value={formatTHB(data.refundedThisMonth)}
          icon={<RotateCcw className="h-5 w-5" />}
          tone="rose"
          footer={`ยกเลิก/หมดอายุ ${data.cancelledBookings} รายการ (${cancelRate}%)`}
        />
        <StatCard
          label="การจองเดือนนี้"
          value={formatNumber(data.totalBookingsThisMonth)}
          unit="รายการ"
          icon={<CalendarCheck className="h-5 w-5" />}
          tone="amber"
          footer={`ชำระแล้ว/ใช้บริการ ${data.confirmedBookings} • รวมปิดรายการ ${total}`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="card space-y-4 p-6">
          <div>
            <div className="eyebrow">Financial Analytics</div>
            <h2 className="text-lg font-bold text-forest-950">รายได้ที่อนุมัติแล้วรายวัน (14 วันล่าสุด)</h2>
            <p className="text-xs text-slate-500">ยอดจากการชำระเงินสถานะ VERIFIED — ชี้ที่แท่งเพื่อดูยอด</p>
          </div>
          <ColumnChart
            rows={Array.from({ length: 14 }, (_, i) => {
              // แกนวันที่ 14 วันคงที่ (วันไหนไม่มีรายได้ = 0) เพื่อให้แท่งมีความกว้างสม่ำเสมอ
              const d = new Date();
              d.setDate(d.getDate() - 13 + i);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const hit = (data.revenueByDay || []).find((r: any) => r.day === key);
              return { label: key, value: hit ? hit.revenue : 0, sub: `${hit ? hit.payments : 0} รายการ` };
            })}
            emptyText="ยังไม่มีรายได้ใน 14 วันล่าสุด"
          />
        </div>
        <div className="card space-y-4 p-6">
          <div>
            <div className="eyebrow">Category Distribution</div>
            <h2 className="text-lg font-bold text-forest-950">รายได้แยกตามสนาม (เดือนนี้)</h2>
          </div>
          <BarList
            rows={(data.bookingsByCourt || []).map((c: any) => ({ label: c.courtName, value: c.revenue, sub: `${c.bookings} การจอง` }))}
            format={(v) => formatTHB(v, 0)}
            emptyText="ยังไม่มีข้อมูล"
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div>
            <div className="eyebrow">Capacity & Slot Analysis</div>
            <h2 className="text-lg font-bold text-forest-950">ช่วงเวลายอดนิยม (Peak Hours Analysis)</h2>
            <p className="text-xs text-slate-500">จำนวนการจองที่ใช้สนามในแต่ละชั่วโมง และรายได้ตามสัดส่วนเวลา (v_revenue_by_hour)</p>
          </div>
          <BarList
            rows={(data.peakHours || []).map((p: any) => ({
              label: `${p.hour} น.`,
              value: p.bookings,
              sub: `รายได้ ${formatTHB(p.revenue || 0, 0)} • ${Math.round((p.bookedMinutes || 0) / 60)} ชม.`,
            }))}
            format={(v) => `${v} ครั้ง`}
            emptyText="ยังไม่มีข้อมูลการใช้สนาม"
          />
        </div>
        <div className="card space-y-4 p-6">
          <div>
            <div className="eyebrow">Equipment Circulation & Penalties</div>
            <h2 className="text-lg font-bold text-forest-950">สถิติอุปกรณ์กีฬาและค่าปรับ (Inventory Insights)</h2>
            <p className="text-xs text-slate-500">ค่าปรับที่ชำระแล้วทั้งหมด: {formatTHB(data.fineRevenue)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-panel text-left text-slate-600">
                  <th className="px-3 py-2">อุปกรณ์</th>
                  <th className="px-3 py-2 text-center">ยืม (ครั้ง)</th>
                  <th className="px-3 py-2 text-center">ชำรุด/หาย</th>
                  <th className="px-3 py-2 text-right">คงเหลือ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.equipmentStats || []).map((e: any) => (
                  <tr key={e.name}>
                    <td className="px-3 py-2 font-medium text-forest-950">{e.name}</td>
                    <td className="px-3 py-2 text-center">{e.timesBorrowed}</td>
                    <td className="px-3 py-2 text-center">{e.damagedOrLost > 0 ? <span className="badge-rose">{e.damagedOrLost}</span> : '0'}</td>
                    <td className="px-3 py-2 text-right">
                      {e.availableQuantity}/{e.totalQuantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card-dark grid gap-4 p-6 md:grid-cols-3">
        <div>
          <div className="text-[11px] text-mint-300">BR12 Tier — เงินคืนเดือนนี้</div>
          <div className="text-2xl font-bold text-white">{formatTHB(data.refundedThisMonth)}</div>
        </div>
        <div>
          <div className="text-[11px] text-mint-300">BR11 — รายรับค่าปรับอุปกรณ์ (สะสม)</div>
          <div className="text-2xl font-bold text-white">{formatTHB(data.fineRevenue)}</div>
        </div>
        <div>
          <div className="text-[11px] text-mint-300">ข้อมูล ณ เวลา</div>
          <div className="text-sm font-semibold text-white">{new Date(data.generatedAt).toLocaleString('th-TH')}</div>
          <div className="text-[11px] text-white/60">คำนวณจากฐานข้อมูล Oracle แบบ Real-time</div>
        </div>
      </div>
    </>
  );
};

const QuickLink: React.FC<{ to: string; icon: React.ReactNode; title: string; desc: string }> = ({ to, icon, title, desc }) => (
  <Link to={to} className="card group flex items-start gap-4 p-5 transition hover:ring-2 hover:ring-mint-200">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-forest-800 group-hover:bg-forest-900 group-hover:text-mint-300">{icon}</div>
    <div>
      <div className="font-semibold text-forest-950">{title}</div>
      <div className="text-xs text-slate-500">{desc}</div>
    </div>
  </Link>
);

// RBAC test (เดิม) สำหรับสาธิตการกันสิทธิ์ 200 vs 403
const RbacTester: React.FC = () => {
  const [testApiLogs, setTestApiLogs] = useState<any[]>([]);
  const testEndpoint = async (roleEndpoint: string) => {
    try {
      const res = await api.get(`/${roleEndpoint}/dashboard`);
      setTestApiLogs((prev) => [{ target: `${roleEndpoint.toUpperCase()} API`, status: res.status, success: true, data: res.data, time: new Date().toLocaleTimeString() }, ...prev]);
    } catch (err: any) {
      const status = err.response?.status || 500;
      setTestApiLogs((prev) => [
        { target: `${roleEndpoint.toUpperCase()} API`, status, success: false, data: err.response?.data || { message: err.message }, time: new Date().toLocaleTimeString() },
        ...prev,
      ]);
    }
  };
  return (
    <div className="card space-y-3 p-6">
      <h2 className="flex items-center gap-2 text-base font-bold text-forest-950">
        <Shield className="h-5 w-5" /> ทดสอบการแยกสิทธิ์ (RBAC Security Matrix)
      </h2>
      <p className="text-xs text-slate-500">ทดลองเรียก API ของแต่ละบทบาท เพื่อดูว่าระบบอนุญาต (200) หรือปฏิเสธ (403)</p>
      <div className="grid gap-2">
        {['customer', 'staff', 'admin', 'executive'].map((r) => (
          <button key={r} onClick={() => testEndpoint(r)} className="btn-soft justify-between text-xs">
            <span className="font-mono">GET /api/{r}/dashboard</span>
            <span className="badge-slate uppercase">{r}</span>
          </button>
        ))}
      </div>
      {testApiLogs.length > 0 && (
        <div className="max-h-48 space-y-2 overflow-y-auto">
          {testApiLogs.map((log, idx) => (
            <div key={idx} className={`rounded-xl p-2.5 text-xs ${log.success ? 'bg-mint-50 text-forest-900' : 'bg-rose-50 text-rose-800'}`}>
              <div className="flex justify-between font-semibold">
                <span>{log.target}</span>
                <span className="flex items-center gap-1">
                  {log.success ? <CheckCircle className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} HTTP {log.status}
                </span>
              </div>
              <div className="mt-0.5 opacity-80">{log.data.message || log.data.error}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const DashboardPage: React.FC = () => {
  const { user, hasRole } = useAuth();
  const primaryRole = user?.roles[0] || 'CUSTOMER';
  const isExecView = hasRole('EXECUTIVE') || hasRole('ADMIN');
  const isStaffSide = isExecView || hasRole('STAFF');

  const { data: dashboard, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', primaryRole],
    queryFn: () => getDashboardByRole(primaryRole),
  });

  // BR17: ผู้บริหารและผู้ดูแลระบบดูรายงานสรุปได้
  const { data: report, isLoading: loadingReport } = useQuery({
    queryKey: ['executiveReport'],
    queryFn: () => getDashboardByRole('EXECUTIVE'),
    enabled: isExecView,
    refetchInterval: 30000,
  });

  const d: any = dashboard || {};
  const refreshBtn = (
    <button onClick={() => refetch()} disabled={isFetching} className="btn-soft">
      <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> รีเฟรชข้อมูล
    </button>
  );

  if (!isStaffSide) {
    return (
      <CustomerLayout>
        <PageHeader
          code="Member Dashboard"
          eyebrow={`สมาชิก ${user?.memberTypeId ? `ประเภท #${user.memberTypeId}` : ''}`}
          title={`สวัสดี คุณ${user?.firstName} ${user?.lastName}`}
          subtitle="ภาพรวมการจอง การชำระเงิน และการแจ้งเตือนของคุณ (ข้อมูลจริงจากระบบ)"
          actions={refreshBtn}
        />
        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="การจองที่กำลังจะถึง" value={d.activeBookings ?? 0} unit="รายการ" icon={<CalendarCheck className="h-5 w-5" />} />
            <StatCard label="รอชำระเงิน (BR3)" value={d.pendingPaymentBookings ?? 0} unit="รายการ" icon={<Wallet className="h-5 w-5" />} tone="amber" />
            <StatCard label="การแจ้งเตือนที่ยังไม่อ่าน" value={d.notificationsCount ?? 0} icon={<Bell className="h-5 w-5" />} tone="blue" />
            <StatCard label="ค่าปรับค้างชำระ" value={formatTHB(d.unpaidFines)} icon={<AlertTriangle className="h-5 w-5" />} tone="rose" footer="ค่าปรับค้างจะทำให้จองสนามใหม่ไม่ได้" />
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <QuickLink to="/courts" icon={<Compass className="h-5 w-5" />} title="ค้นหาและจองสนาม (UCS-2)" desc="ดูตารางเวลาว่างแบบ Real-time" />
          <QuickLink to="/my-bookings" icon={<ReceiptText className="h-5 w-5" />} title="รายการจองของฉัน (UCS-6.1)" desc="ชำระเงิน ดูใบเสร็จ หรือยกเลิกคืนเงิน" />
          <QuickLink to="/fines" icon={<AlertTriangle className="h-5 w-5" />} title="ค่าปรับอุปกรณ์" desc="ตรวจสอบและชำระค่าปรับ (BR11)" />
        </div>
        <RbacTester />
      </CustomerLayout>
    );
  }

  return (
    <StaffLayout>
      <PageHeader
        code={isExecView ? 'UCS-9 Master Module' : 'Staff Overview'}
        eyebrow={isExecView ? 'รายงานประจำเดือน (Monthly Settlement)' : 'เคาน์เตอร์บริการ'}
        title={isExecView ? 'แดชบอร์ดสรุปรายงานรายได้และสถิติการใช้งานสนามกีฬา' : `ภาพรวมการทำงานวันนี้ — คุณ${user?.firstName}`}
        subtitle={
          isExecView
            ? 'รายงานภาพรวมรายได้ อัตราการครองสนาม สถิติอุปกรณ์และค่าปรับ (BR11) และยอดคืนเงิน (BR12) จากฐานข้อมูลจริง (BR17)'
            : 'คิวงานที่ต้องดำเนินการ: ตรวจสลิป เช็คอิน ส่งมอบ/รับคืนอุปกรณ์ และอนุมัติคืนเงิน'
        }
        actions={refreshBtn}
      />

      {hasRole('STAFF') && !isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="สลิปรอตรวจ (UCS-7)" value={d.pendingPaymentSlips ?? 0} icon={<ReceiptText className="h-5 w-5" />} tone="amber" />
          <StatCard label="การจองที่ชำระแล้ววันนี้" value={d.todayBookings ?? 0} icon={<CalendarCheck className="h-5 w-5" />} />
          <StatCard label="เช็คอินแล้ววันนี้" value={d.todayCheckIns ?? 0} icon={<BadgeCheck className="h-5 w-5" />} tone="blue" />
          <StatCard label="อุปกรณ์ที่ถูกยืมอยู่" value={d.outstandingBorrowings ?? 0} icon={<Dumbbell className="h-5 w-5" />} />
          <StatCard label="คำขอคืนเงินรออนุมัติ" value={d.pendingRefunds ?? 0} icon={<ClipboardCheck className="h-5 w-5" />} tone="rose" />
        </div>
      )}

      {hasRole('ADMIN') && !isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="ผู้ใช้งานที่ใช้งานอยู่" value={d.totalUsers ?? 0} unit="บัญชี" icon={<Users className="h-5 w-5" />} />
          <StatCard label="สนามที่เปิดใช้งาน" value={d.totalCourts ?? 0} unit="คอร์ท" icon={<Warehouse className="h-5 w-5" />} tone="blue" />
          <StatCard label="โปรโมชั่นที่ยังไม่หมดอายุ" value={d.totalPromotions ?? 0} icon={<Tag className="h-5 w-5" />} tone="amber" />
          <StatCard label="Audit log วันนี้ (BR16)" value={d.auditLogsToday ?? 0} icon={<FileClock className="h-5 w-5" />} />
        </div>
      )}

      {hasRole('STAFF') && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <QuickLink to="/staff/payments" icon={<ReceiptText className="h-5 w-5" />} title="ตรวจสอบสลิป (UCS-7)" desc="อนุมัติ/ปฏิเสธสลิป ออกใบเสร็จ" />
          <QuickLink to="/staff/equipment/borrow" icon={<Dumbbell className="h-5 w-5" />} title="เช็คอิน & ส่งมอบอุปกรณ์ (UCS-5)" desc="ตรวจ BR8 / BR9" />
          <QuickLink to="/staff/equipment/return" icon={<RotateCcw className="h-5 w-5" />} title="รับคืนอุปกรณ์ & ค่าปรับ" desc="คำนวณค่าปรับ BR11" />
          <QuickLink to="/staff/refunds" icon={<ClipboardCheck className="h-5 w-5" />} title="อนุมัติคืนเงิน (UCS-6.4)" desc="เกณฑ์ BR12" />
        </div>
      )}

      {isExecView &&
        (loadingReport || !report ? (
          <LoadingState label="กำลังประมวลผลรายงานผู้บริหาร..." />
        ) : (
          <ExecutiveReport data={report} />
        ))}

      {!isExecView && (
        <div className="card-soft flex items-center gap-3 p-4 text-xs text-slate-600">
          <BarChart3 className="h-5 w-5 text-forest-700" />
          รายงานรายได้และสถิติ (UCS-9) เปิดให้ผู้บริหารและผู้ดูแลระบบตามกฎ BR17
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3 p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-forest-950">
            <CalendarX className="h-5 w-5" /> สิทธิ์การใช้งานของบทบาท {user?.roles.join(', ')}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {(d.capabilities || []).map((cap: string) => (
              <div key={cap} className="flex items-center gap-2 rounded-xl bg-panel px-3 py-2 text-xs">
                <CheckCircle className="h-4 w-4 shrink-0 text-mint-600" /> {cap}
              </div>
            ))}
          </div>
        </div>
        <RbacTester />
      </div>
    </StaffLayout>
  );
};
