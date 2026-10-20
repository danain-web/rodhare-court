import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAdminEquipmentApi,
  createAdminEquipmentApi,
  updateAdminEquipmentApi,
  deleteAdminEquipmentApi,
  getAdminSportsApi,
  EquipmentAdmin,
} from '../services/admin';
import { StaffLayout } from '../components/layout/StaffLayout';
import { AdminSportsPanel } from '../components/AdminSportsPanel';
import { Alert, ConfirmModal, EmptyState, LoadingState, Modal, PageHeader, StatCard, apiErrorMessage, formatTHB, sportLabel } from '../components/ui';
import { AlertTriangle, Boxes, Loader2, Package, PackageCheck, Pencil, Plus, Search, ShieldCheck, Trash2, Warehouse } from 'lucide-react';

// UCS-8 ทะเบียนคลังอุปกรณ์กีฬา (Equipment Inventory Ledger)
export const AdminEquipmentPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<EquipmentAdmin | null>(null); // null = เพิ่มใหม่
  const [deleting, setDeleting] = useState<EquipmentAdmin | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [sportTypeId, setSportTypeId] = useState<number>(1);
  const [name, setName] = useState('');
  const [totalQuantity, setTotalQuantity] = useState<number>(10);
  const [rentalFee, setRentalFee] = useState<number>(30);
  const [depositFee, setDepositFee] = useState<number>(0);
  const [fineRatePerDay, setFineRatePerDay] = useState<number>(0);
  const [replacementCost, setReplacementCost] = useState<number>(500);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState<number | undefined>(undefined);

  const { data: equipmentList = [], isLoading } = useQuery({ queryKey: ['adminEquipment'], queryFn: getAdminEquipmentApi });
  const { data: sports = [] } = useQuery({ queryKey: ['adminSports'], queryFn: getAdminSportsApi });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSportTypeId(sports[0]?.sportTypeId ?? 1);
    setTotalQuantity(10);
    setRentalFee(30);
    setDepositFee(0);
    setFineRatePerDay(0);
    setReplacementCost(500);
    setErrorMsg('');
    setShowModal(true);
  };

  const openEdit = (eq: EquipmentAdmin) => {
    setEditing(eq);
    setName(eq.name);
    setSportTypeId(eq.sportTypeId);
    setTotalQuantity(eq.totalQuantity);
    setRentalFee(eq.rentalFee);
    setDepositFee(eq.depositFee);
    setFineRatePerDay(eq.fineRatePerDay);
    setReplacementCost(eq.replacementCost);
    setErrorMsg('');
    setShowModal(true);
  };

  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof createAdminEquipmentApi>[0]) =>
      editing ? updateAdminEquipmentApi(editing.equipmentId, input) : createAdminEquipmentApi(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminEquipment'] });
      setShowModal(false);
      setSuccessMsg(editing ? `แก้ไขอุปกรณ์ "${name}" เรียบร้อย` : `เพิ่มอุปกรณ์ "${name}" เข้าคลังเรียบร้อย`);
      setErrorMsg('');
    },
    onError: (err) => setErrorMsg(apiErrorMessage(err, 'บันทึกอุปกรณ์ไม่สำเร็จ')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminEquipmentApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminEquipment'] });
      setSuccessMsg(`ลบอุปกรณ์ "${deleting?.name}" เรียบร้อย`);
      setDeleting(null);
    },
    onError: (err) => setDeleteError(apiErrorMessage(err, 'ลบอุปกรณ์ไม่สำเร็จ')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ sportTypeId, name, totalQuantity, rentalFee, depositFee, fineRatePerDay, replacementCost });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipmentList.filter((e) => (!sportFilter || e.sportTypeId === sportFilter) && (!q || e.name.toLowerCase().includes(q)));
  }, [equipmentList, search, sportFilter]);

  const totals = equipmentList.reduce(
    (a, e) => ({ total: a.total + e.totalQuantity, available: a.available + e.availableQuantity }),
    { total: 0, available: 0 }
  );
  const lowStock = equipmentList.filter((e) => e.totalQuantity > 0 && e.availableQuantity / e.totalQuantity < 0.3);

  return (
    <StaffLayout>
      <PageHeader
        code="Equipment Inventory"
        eyebrow="บริหารจัดการระบบ"
        title="สต็อกครุภัณฑ์และอุปกรณ์กีฬา (Equipment Inventory Ledger)"
        subtitle="ตรวจสอบจำนวนคงเหลือ ค่าเช่า และราคาประเมินสำหรับคิดค่าปรับกรณีชำรุด/สูญหาย"
        actions={
          <>
            <Link to="/admin/courts" className="btn-soft">
              <Warehouse className="h-4 w-4" /> จัดการสนาม
            </Link>
            <button onClick={openCreate} className="btn-primary">
              <Plus className="h-4 w-4" /> เพิ่มรายการอุปกรณ์
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="รายการอุปกรณ์ในทะเบียน" value={equipmentList.length} unit="รายการ" icon={<Boxes className="h-5 w-5" />} />
        <StatCard label="อุปกรณ์ทั้งหมดในคลัง" value={totals.total} unit="ชิ้น" icon={<Package className="h-5 w-5" />} tone="blue" />
        <StatCard
          label="พร้อมให้เช่า / ถูกจองหรือยืมอยู่"
          value={`${totals.available} / ${totals.total - totals.available}`}
          icon={<PackageCheck className="h-5 w-5" />}
          footer={totals.total ? `ใช้งานอยู่ ${Math.round(((totals.total - totals.available) / totals.total) * 100)}%` : ''}
        />
        <StatCard label="แจ้งเตือนสต็อกต่ำ (< 30%)" value={lowStock.length} unit="รายการ" icon={<AlertTriangle className="h-5 w-5" />} tone="rose" />
      </div>

      {successMsg && <Alert tone="success" title={successMsg} onClose={() => setSuccessMsg('')} />}
      {lowStock.length > 0 && (
        <Alert tone="warning" title="อุปกรณ์ใกล้หมดสต็อก">
          {lowStock.map((e) => `${e.name} (เหลือ ${e.availableQuantity}/${e.totalQuantity})`).join(' • ')}
        </Alert>
      )}

      <div className="card space-y-4 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSportFilter(undefined)} className={`badge py-1 ${!sportFilter ? 'bg-forest-900 text-white' : 'bg-panel text-forest-900'}`}>
              ทั้งหมด
            </button>
            {sports.map((s) => (
              <button
                key={s.sportTypeId}
                onClick={() => setSportFilter(s.sportTypeId)}
                className={`badge py-1 ${sportFilter === s.sportTypeId ? 'bg-forest-900 text-white' : 'bg-panel text-forest-900'}`}
              >
                {sportLabel(s.name)}
              </button>
            ))}
          </div>
          <div className="relative lg:w-64">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="ค้นหาชื่ออุปกรณ์..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <LoadingState label="กำลังโหลดทะเบียนอุปกรณ์..." />
        ) : filtered.length === 0 ? (
          <EmptyState title="ไม่พบอุปกรณ์" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-panel text-left text-[11px] text-slate-600">
                  <th className="rounded-l-lg px-3 py-2.5">รายการอุปกรณ์ / รหัส</th>
                  <th className="px-3 py-2.5">หมวดหมู่</th>
                  <th className="px-3 py-2.5 text-center">คงคลังรวม</th>
                  <th className="px-3 py-2.5 text-center">ว่างพร้อมเช่า</th>
                  <th className="px-3 py-2.5 text-center">ถูกจอง/ยืมอยู่</th>
                  <th className="px-3 py-2.5">ระดับสต็อก</th>
                  <th className="px-3 py-2.5 text-right">ค่าเช่า / ราคาประเมิน</th>
                  <th className="rounded-r-lg px-3 py-2.5 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((eq: EquipmentAdmin) => {
                  const pct = eq.totalQuantity ? Math.round((eq.availableQuantity / eq.totalQuantity) * 100) : 0;
                  const low = pct < 30;
                  return (
                    <tr key={eq.equipmentId}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel text-forest-700">
                            <Package className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-forest-950">{eq.name}</div>
                            <div className="text-[11px] text-slate-500">รหัส: EQ-{eq.equipmentId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="badge-mint">{sportLabel(eq.sportName)}</span>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold">{eq.totalQuantity}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={low ? 'badge-rose' : 'badge-mint'}>{eq.availableQuantity}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600">{eq.totalQuantity - eq.availableQuantity}</td>
                      <td className="px-3 py-3">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${low ? 'bg-rose-500' : 'bg-mint-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">{pct}% พร้อมใช้</div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold text-forest-950">{formatTHB(eq.rentalFee, 0)}/ชิ้น</div>
                        <div className="text-[11px] text-rose-600">ปรับชำรุด {formatTHB(eq.replacementCost, 0)}</div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => openEdit(eq)} className="btn-soft px-2.5 py-1.5 text-xs" aria-label={`แก้ไข ${eq.name}`}>
                            <Pencil className="h-3.5 w-3.5" /> แก้ไข
                          </button>
                          <button
                            onClick={() => {
                              setDeleteError('');
                              setDeleting(eq);
                            }}
                            className="btn-danger-soft px-2.5 py-1.5 text-xs"
                            aria-label={`ลบ ${eq.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-soft flex items-center gap-3 p-4 text-xs text-slate-600">
        <ShieldCheck className="h-5 w-5 text-forest-700" />
        สต็อกตัดอัตโนมัติเมื่อมีการจอง คืนเมื่อยกเลิก/หมดเวลา และอุปกรณ์ชำรุด/สูญหายจะถูกตัดออกจากคลังถาวรเมื่อรับคืน
      </div>

      <AdminSportsPanel sports={sports} />

      <ConfirmModal
        open={!!deleting}
        danger
        title="ลบรายการอุปกรณ์"
        confirmLabel="ลบอุปกรณ์"
        busy={deleteMutation.isPending}
        error={deleteError}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.equipmentId)}
        message={
          <>
            ต้องการลบ <strong>{deleting?.name}</strong> ออกจากทะเบียนหรือไม่? ลบได้เฉพาะอุปกรณ์ที่ไม่เคยถูกจองหรือยืม
            ถ้ามีประวัติแล้วให้ใช้ "แก้ไข" แล้วตั้งจำนวนทั้งหมดเป็น 0 เพื่อเลิกใช้งานแทน
          </>
        }
      />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? `แก้ไขอุปกรณ์ EQ-${editing.equipmentId}` : 'เพิ่มรายการอุปกรณ์ใหม่'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && <Alert tone="error" title={errorMsg} />}
          <div>
            <label className="label">หมวดหมู่กีฬา</label>
            <select className="input" value={sportTypeId} onChange={(e) => setSportTypeId(parseInt(e.target.value, 10))}>
              {sports.map((s) => (
                <option key={s.sportTypeId} value={s.sportTypeId}>
                  {sportLabel(s.name)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ชื่ออุปกรณ์</label>
            <input required className="input" placeholder="เช่น ไม้แบดมินตัน Yonex Astrox" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">จำนวนทั้งหมด</label>
              <input type="number" min={editing ? 0 : 1} required className="input" value={totalQuantity} onChange={(e) => setTotalQuantity(parseInt(e.target.value, 10) || 0)} />
            </div>
            <div>
              <label className="label">ค่าเช่า (฿)</label>
              <input type="number" min="0" required className="input" value={rentalFee} onChange={(e) => setRentalFee(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label">ราคาประเมิน (฿)</label>
              <input type="number" min="0" required className="input" value={replacementCost} onChange={(e) => setReplacementCost(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">เงินมัดจำ (฿)</label>
              <input type="number" min="0" className="input" value={depositFee} onChange={(e) => setDepositFee(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label">ค่าปรับคืนช้า (฿/วัน)</label>
              <input type="number" min="0" className="input" value={fineRatePerDay} onChange={(e) => setFineRatePerDay(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          {editing && (
            <p className="rounded-xl bg-panel p-3 text-[11px] text-slate-600">
              ขณะนี้ถูกจอง/ยืมอยู่ {editing.totalQuantity - editing.availableQuantity} ชิ้น — จำนวนทั้งหมดต้องไม่น้อยกว่านี้ ระบบปรับจำนวนว่างให้ตามส่วนต่างอัตโนมัติ
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setShowModal(false)} className="btn-outline">
              ยกเลิก
            </button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} บันทึกอุปกรณ์
            </button>
          </div>
        </form>
      </Modal>
    </StaffLayout>
  );
};
