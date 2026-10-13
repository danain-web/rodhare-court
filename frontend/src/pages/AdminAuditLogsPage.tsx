import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminAuditLogsApi, AuditLog } from '../services/admin';
import { StaffLayout } from '../components/layout/StaffLayout';
import { EmptyState, LoadingState, Modal, PageHeader, StatCard, formatDateTime } from '../components/ui';
import { Activity, Clock, Eye, FileClock, Filter, RefreshCw, Search, User } from 'lucide-react';

const ENTITIES = ['ALL', 'BOOKINGS', 'PAYMENTS', 'REFUND_REQUESTS', 'EQUIPMENT_BORROWINGS', 'FINES', 'COURTS', 'EQUIPMENT', 'PROMOTIONS', 'PRICING_RATES', 'SPORT_TYPES', 'USERS', 'USER_SESSIONS'];

const actionTone = (action: string) => {
  if (/^(CREATE|REGISTER|LOGIN)/.test(action)) return 'badge-mint';
  if (/^(UPDATE|VERIFY|APPROVE|CHECK_IN|BORROW|RETURN|PAY|SUBMIT)/.test(action)) return 'badge-blue';
  if (/^(DELETE|CANCEL|REJECT|EXPIRE|REMOVE)/.test(action)) return 'badge-rose';
  return 'badge-slate';
};

const pretty = (v?: string) => {
  if (!v) return '-';
  try {
    return JSON.stringify(JSON.parse(v), null, 2);
  } catch {
    return v;
  }
};

// BR16 บันทึกประวัติการทำงานของระบบ (AUDIT_LOGS)
export const AdminAuditLogsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['adminAuditLogs'],
    queryFn: getAdminAuditLogsApi,
  });

  const filteredLogs = logs.filter((log: AuditLog) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      log.action.toLowerCase().includes(q) ||
      (log.userName && log.userName.toLowerCase().includes(q)) ||
      log.entityName.toLowerCase().includes(q) ||
      String(log.entityId || '').includes(q);
    const matchesEntity = selectedEntity === 'ALL' || log.entityName === selectedEntity;
    return matchesSearch && matchesEntity;
  });

  const todayCount = logs.filter((l) => new Date(l.createdAt).toDateString() === new Date().toDateString()).length;
  const actors = new Set(logs.map((l) => l.userName)).size;

  return (
    <StaffLayout>
      <PageHeader
        code="BR16 Audit Trail"
        eyebrow="บริหารจัดการระบบ"
        title="บันทึกการทำงานของระบบ (Audit Logs)"
        subtitle="ตรวจสอบย้อนหลังว่าใครทำอะไร เมื่อใด ทั้งการจอง การชำระเงิน การยกเลิก และการแก้ไขข้อมูลหลัก พร้อมค่าก่อน-หลัง"
        actions={
          <button onClick={() => refetch()} className="btn-soft">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> รีเฟรช
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="บันทึกล่าสุดที่โหลด" value={logs.length} unit="รายการ" icon={<FileClock className="h-5 w-5" />} />
        <StatCard label="เหตุการณ์วันนี้" value={todayCount} unit="รายการ" icon={<Activity className="h-5 w-5" />} tone="blue" />
        <StatCard label="ผู้กระทำที่เกี่ยวข้อง" value={actors} unit="บัญชี" icon={<User className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="ค้นหา action, ผู้ใช้, entity, รหัส..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Filter className="h-4 w-4" /> ตาราง:
          <select className="input w-auto py-2" value={selectedEntity} onChange={(e) => setSelectedEntity(e.target.value)}>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e === 'ALL' ? 'ทั้งหมด' : e}
              </option>
            ))}
          </select>
          <span className="badge-amber">{filteredLogs.length} รายการ</span>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="กำลังโหลด Audit Logs..." />
      ) : filteredLogs.length === 0 ? (
        <EmptyState title="ไม่พบบันทึกที่ตรงเงื่อนไข" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-panel text-[11px] text-slate-600">
                <th className="px-4 py-3">Log ID</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">ผู้กระทำ</th>
                <th className="px-4 py-3">ค่าใหม่ / รายละเอียด</th>
                <th className="px-4 py-3">เวลา</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log: AuditLog) => (
                <tr key={log.logId} className="hover:bg-panel/50">
                  <td className="px-4 py-3 font-mono text-slate-500">#{log.logId}</td>
                  <td className="px-4 py-3">
                    <span className={actionTone(log.action)}>{log.action}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-forest-950">
                    {log.entityName} {log.entityId ? `#${log.entityId}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-forest-600" /> {log.userName || `User #${log.userId}`}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 font-mono text-[11px] text-slate-500">{log.newValues || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> {formatDateTime(log.createdAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setDetail(log)} className="rounded-lg bg-panel p-1.5 text-forest-800 hover:bg-forest-100" title="ดูค่าก่อน-หลัง">
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Audit Log #${detail?.logId} — ${detail?.action}`} size="lg">
        {detail && (
          <div className="space-y-4 text-xs">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-panel p-3">
                <div className="text-slate-500">Entity</div>
                <div className="font-semibold">
                  {detail.entityName} #{detail.entityId}
                </div>
              </div>
              <div className="rounded-xl bg-panel p-3">
                <div className="text-slate-500">ผู้กระทำ</div>
                <div className="font-semibold">{detail.userName}</div>
              </div>
              <div className="rounded-xl bg-panel p-3">
                <div className="text-slate-500">เวลา / IP</div>
                <div className="font-semibold">
                  {formatDateTime(detail.createdAt)} {detail.ipAddress ? `• ${detail.ipAddress}` : ''}
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 font-semibold text-rose-700">ค่าก่อนเปลี่ยน (old_values)</div>
                <pre className="max-h-72 overflow-auto rounded-xl bg-rose-50 p-3 text-[11px]">{pretty(detail.oldValues)}</pre>
              </div>
              <div>
                <div className="mb-1 font-semibold text-forest-700">ค่าหลังเปลี่ยน (new_values)</div>
                <pre className="max-h-72 overflow-auto rounded-xl bg-mint-50 p-3 text-[11px]">{pretty(detail.newValues)}</pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </StaffLayout>
  );
};
