import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCourtsApi, getSportsApi, createCourtApi, updateCourtApi, deleteCourtApi, updateCourtImageApi } from '../services/court';
import { getAdminPricingRatesApi } from '../services/admin';
import { PricingRatesPanel } from '../components/PricingRatesPanel';
import { Court } from '../types/court';
import { StaffLayout } from '../components/layout/StaffLayout';
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatCard, StatusBadge, apiErrorMessage, formatTHB, sportLabel } from '../components/ui';
import {
  CheckCircle2,
  Edit2,
  Eye,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  Warehouse,
  Wrench,
  XCircle,
} from 'lucide-react';

const DEFAULT_COURT_PLACEHOLDER = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1000&q=80';

// UCS-8 จัดการข้อมูลสนาม (BR13: เฉพาะผู้ดูแลระบบ)
export const AdminCourtsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [tab, setTab] = useState<'courts' | 'pricing'>('courts');
  const [sportFilter, setSportFilter] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [pageMsg, setPageMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Court | null>(null);
  const [statusBusy, setStatusBusy] = useState<number | null>(null);

  // Image Management Modal State
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageModalCourt, setImageModalCourt] = useState<Court | null>(null);
  const [inputImageUrl, setInputImageUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const [imageSuccess, setImageSuccess] = useState('');
  const [isSavingImage, setIsSavingImage] = useState(false);

  // Form State for Court Create/Edit
  const [sportTypeId, setSportTypeId] = useState<number>(1);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [locationDetails, setLocationDetails] = useState('');
  const [hourlyRate, setHourlyRate] = useState<number>(150);
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState<'AVAILABLE' | 'MAINTENANCE' | 'CLOSED'>('AVAILABLE');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: sports = [] } = useQuery({ queryKey: ['sports'], queryFn: getSportsApi });
  const { data: courts = [], isLoading, refetch } = useQuery({ queryKey: ['adminCourts'], queryFn: () => getCourtsApi() });
  const { data: rates = [] } = useQuery({ queryKey: ['adminPricingRates'], queryFn: getAdminPricingRatesApi, enabled: tab === 'pricing' });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courts.filter(
      (c) => (!sportFilter || c.sportTypeId === sportFilter) && (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    );
  }, [courts, sportFilter, search]);

  const counts = {
    total: courts.length,
    available: courts.filter((c) => c.status === 'AVAILABLE').length,
    maintenance: courts.filter((c) => c.status === 'MAINTENANCE').length,
    closed: courts.filter((c) => c.status === 'CLOSED').length,
  };

  const openCreateModal = () => {
    setEditingCourt(null);
    setSportTypeId(sports[0]?.sportTypeId || 1);
    setName('');
    setCode(`CRT-${Date.now().toString().slice(-4)}`);
    setLocationDetails('');
    setHourlyRate(150);
    setImageUrl('');
    setStatus('AVAILABLE');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (c: Court) => {
    setEditingCourt(c);
    setSportTypeId(c.sportTypeId);
    setName(c.name);
    setCode(c.code);
    setLocationDetails(c.locationDetails || '');
    setHourlyRate(c.hourlyRate);
    setImageUrl(c.imageUrl && !c.imageUrl.startsWith('data:') ? c.imageUrl : '');
    setStatus(c.status);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openImageModal = (c: Court) => {
    setImageModalCourt(c);
    const initialUrl = c.imageUrl || '';
    setInputImageUrl(initialUrl);
    setPreviewUrl(initialUrl || DEFAULT_COURT_PLACEHOLDER);
    setImageError('');
    setImageSuccess('');
    setIsImageModalOpen(true);
  };

  // File Upload Handler with Validation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError('');
    setImageSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setImageError('รูปแบบไฟล์ไม่ถูกต้อง รองรับเฉพาะ JPG, PNG, WEBP และ GIF');
      return;
    }

    const maxSizeInBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      setImageError('ไฟล์ใหญ่เกินไป ขนาดไม่เกิน 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setInputImageUrl(result);
      setPreviewUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (val: string) => {
    setInputImageUrl(val);
    setImageError('');
    setImageSuccess('');
    if (!val.trim()) {
      setPreviewUrl(DEFAULT_COURT_PLACEHOLDER);
      return;
    }
    const hasInvalidExt = /\.(pdf|exe|txt|doc|docx|zip|rar)$/i.test(val.trim());
    if (hasInvalidExt) setImageError('ลิงก์ต้องเป็นไฟล์รูปภาพ (JPG, PNG, WEBP, GIF)');
    setPreviewUrl(val.trim());
  };

  const invalidateCourts = () => {
    queryClient.invalidateQueries({ queryKey: ['adminCourts'] });
    queryClient.invalidateQueries({ queryKey: ['courts'] });
    queryClient.invalidateQueries({ queryKey: ['court'] });
    queryClient.invalidateQueries({ queryKey: ['courtDetail'] });
    refetch();
  };

  const handleSaveCourtImage = async () => {
    if (!imageModalCourt) return;
    setImageError('');
    setImageSuccess('');
    setIsSavingImage(true);
    try {
      await updateCourtImageApi(imageModalCourt.courtId, inputImageUrl || null);
      invalidateCourts();
      setImageSuccess('อัปเดตรูปภาพหลักของสนามเรียบร้อย หน้าลูกค้าแสดงผลทันที');
    } catch (err: any) {
      setImageError(err.response?.data?.message || err.message || 'Failed to update court image');
    } finally {
      setIsSavingImage(false);
    }
  };

  const handleRemoveCourtImage = async () => {
    if (!imageModalCourt) return;
    setImageError('');
    setImageSuccess('');
    setIsSavingImage(true);
    try {
      await updateCourtImageApi(imageModalCourt.courtId, null);
      setInputImageUrl('');
      setPreviewUrl(DEFAULT_COURT_PLACEHOLDER);
      invalidateCourts();
      setImageSuccess('ลบรูปภาพเรียบร้อย ระบบจะแสดงภาพเริ่มต้นแทน');
    } catch (err: any) {
      setImageError(err.response?.data?.message || err.message || 'Failed to remove court image');
    } finally {
      setIsSavingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      if (editingCourt) {
        await updateCourtApi(editingCourt.courtId, {
          sportTypeId,
          name,
          code,
          locationDetails,
          hourlyRate,
          imageUrl: imageUrl || undefined,
          status,
        });
      } else {
        await createCourtApi({
          sportTypeId,
          name,
          code,
          locationDetails,
          hourlyRate,
          imageUrl: imageUrl || undefined,
          status,
        });
      }
      setIsModalOpen(false);
      setPageMsg({ tone: 'success', text: editingCourt ? `บันทึกการแก้ไขสนาม ${name} แล้ว` : `เพิ่มสนาม ${name} เรียบร้อย (เวลาเปิด-ปิดเริ่มต้น 08:00-22:00)` });
      invalidateCourts();
    } catch (err: any) {
      setFormError(err.response?.data?.message || err.message || 'Failed to save court');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (courtId: number) => {
    try {
      await deleteCourtApi(courtId);
      setPageMsg({ tone: 'success', text: 'ปิดใช้งานสนามเรียบร้อย (Soft delete)' });
      invalidateCourts();
    } catch (err: any) {
      setPageMsg({ tone: 'error', text: err.response?.data?.message || err.message || 'Failed to delete court' });
    } finally {
      setDeleteTarget(null);
    }
  };

  // สลับสถานะเปิด/ปิดจองออนไลน์ (AVAILABLE ↔ MAINTENANCE)
  const quickStatus = async (c: Court, next: 'AVAILABLE' | 'MAINTENANCE' | 'CLOSED') => {
    setStatusBusy(c.courtId);
    try {
      await updateCourtApi(c.courtId, { status: next });
      setPageMsg({ tone: 'success', text: `เปลี่ยนสถานะ ${c.name} เป็น ${next}` });
      invalidateCourts();
    } catch (err) {
      setPageMsg({ tone: 'error', text: apiErrorMessage(err) });
    } finally {
      setStatusBusy(null);
    }
  };

  return (
    <StaffLayout>
      <PageHeader
        code="Court Management"
        eyebrow="บริหารจัดการระบบ"
        title="จัดการข้อมูลสนามและสต็อกอุปกรณ์กีฬา"
        subtitle="บริหารสถานะสนาม เปิด-ปิดปรับปรุง (Maintenance Mode) ราคาต่อชั่วโมง และรูปภาพสนาม — เฉพาะผู้ดูแลระบบ"
        actions={
          <>
            <Link to="/admin/equipment" className="btn-mint">
              <PackageCheck className="h-4 w-4" /> สต็อกอุปกรณ์
            </Link>
            <button onClick={openCreateModal} className="btn-primary">
              <Plus className="h-4 w-4" /> เพิ่มสนามใหม่
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="สนามทั้งหมดในระบบ" value={counts.total} unit="คอร์ท" icon={<Warehouse className="h-5 w-5" />} />
        <StatCard label="พร้อมใช้งาน" value={counts.available} unit="คอร์ท" icon={<CheckCircle2 className="h-5 w-5" />} tone="blue" footer={counts.total ? `${Math.round((counts.available / counts.total) * 100)}% พร้อมให้บริการ` : ''} />
        <StatCard label="ปิดปรับปรุงชั่วคราว" value={counts.maintenance} unit="รายการ" icon={<Wrench className="h-5 w-5" />} tone="amber" />
        <StatCard label="ปิดให้บริการ" value={counts.closed} unit="คอร์ท" icon={<ShieldAlert className="h-5 w-5" />} tone="rose" />
      </div>

      {pageMsg && <Alert tone={pageMsg.tone} title={pageMsg.text} onClose={() => setPageMsg(null)} />}

      <div className="card-soft grid grid-cols-2 gap-2 p-2">
        {[
          { k: 'courts', l: 'จัดการสถานะและข้อมูลสนาม (Court Management)', n: courts.length },
          { k: 'pricing', l: 'อัตราค่าบริการตามช่วงเวลา (Pricing Rates)', n: rates.length || undefined },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as any)}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm ${tab === t.k ? 'bg-white font-semibold text-forest-950 shadow' : 'text-forest-800'}`}
          >
            {t.l} {t.n !== undefined && <span className="badge-mint">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'pricing' ? (
        <PricingRatesPanel courts={courts} sports={sports} />
      ) : (
        <>
          <div className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-forest-950">รายการสนามและสถานะเปิดจอง (Court Availability)</span>
              <button
                onClick={() => setSportFilter(undefined)}
                className={`badge py-1 ${!sportFilter ? 'bg-forest-900 text-white' : 'bg-panel text-forest-900'}`}
              >
                ทั้งหมด ({courts.length})
              </button>
              {sports.map((s) => (
                <button
                  key={s.sportTypeId}
                  onClick={() => setSportFilter(s.sportTypeId)}
                  className={`badge py-1 ${sportFilter === s.sportTypeId ? 'bg-forest-900 text-white' : 'bg-panel text-forest-900'}`}
                >
                  {sportLabel(s.name)} ({courts.filter((c) => c.sportTypeId === s.sportTypeId).length})
                </button>
              ))}
            </div>
            <div className="relative lg:w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input className="input pl-9" placeholder="ค้นหาชื่อคอร์ท / รหัส..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {isLoading ? (
            <LoadingState label="กำลังโหลดข้อมูลสนาม..." />
          ) : filtered.length === 0 ? (
            <EmptyState title="ไม่พบสนาม" />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((c) => {
                const online = c.status === 'AVAILABLE';
                return (
                  <div key={c.courtId} className={`card flex flex-col overflow-hidden ${c.status === 'MAINTENANCE' ? 'ring-1 ring-amber-200' : ''}`}>
                    <div className="group relative h-40 bg-forest-900">
                      <img src={c.imageUrl || DEFAULT_COURT_PLACEHOLDER} alt={c.name} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} className="h-full w-full object-cover" />
                      <button
                        onClick={() => openImageModal(c)}
                        className="absolute inset-0 flex items-center justify-center gap-2 bg-forest-950/60 text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100"
                      >
                        <ImageIcon className="h-5 w-5" /> จัดการรูปภาพ
                      </button>
                      <div className="absolute left-3 top-3">
                        <StatusBadge status={c.status} className="shadow" />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-forest-950">{c.name}</div>
                          <div className="text-[11px] text-slate-500">{c.locationDetails || '-'}</div>
                        </div>
                        <span className="badge-mint shrink-0 whitespace-nowrap">{c.code}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-panel p-3 text-xs">
                        <div>
                          <div className="text-slate-500">อัตราค่าบริการ</div>
                          <div className="font-bold text-forest-950">{formatTHB(c.hourlyRate, 0)}/ชม.</div>
                        </div>
                        <div>
                          <div className="text-slate-500">ประเภทกีฬา</div>
                          <div className="font-bold text-forest-950">{sportLabel(c.sportName)}</div>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <button
                          onClick={() => quickStatus(c, online ? 'MAINTENANCE' : 'AVAILABLE')}
                          disabled={statusBusy === c.courtId}
                          className="flex items-center gap-2 text-[11px] text-slate-600"
                          title="สลับเปิด/ปิดจองออนไลน์"
                        >
                          <span className={`relative h-6 w-11 rounded-full transition ${online ? 'bg-forest-900' : 'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${online ? 'left-[22px]' : 'left-0.5'}`} />
                          </span>
                          {statusBusy === c.courtId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : online ? 'เปิดจองออนไลน์' : 'ปิดจอง (ปรับปรุง)'}
                        </button>
                        <div className="flex gap-1">
                          <button onClick={() => openEditModal(c)} className="rounded-lg bg-panel p-2 text-forest-800 hover:bg-forest-100" title="แก้ไข">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(c)} className="rounded-lg bg-rose-50 p-2 text-rose-700 hover:bg-rose-100" title="ปิดใช้งานสนาม">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="card-soft flex items-center gap-3 p-4 text-xs text-slate-600">
        <ShieldAlert className="h-5 w-5 text-forest-700" />
        มาตรฐานการบริหารจัดการทรัพย์สินสนามกีฬา: การลบสนามที่ยังมีการจองในอนาคตจะถูกปฏิเสธ ให้เปลี่ยนเป็น MAINTENANCE แทน และทุกการแก้ไขถูกบันทึกใน Audit Log
      </div>

      {/* Image Modal */}
      <Modal
        open={isImageModalOpen && !!imageModalCourt}
        onClose={() => setIsImageModalOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> จัดการรูปภาพสนาม: {imageModalCourt?.name}
          </span>
        }
      >
        <div className="space-y-4">
          {imageSuccess && <Alert tone="success" title={imageSuccess} />}
          {imageError && <Alert tone="error" title={imageError} />}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 font-semibold text-slate-600">
                <Eye className="h-3.5 w-3.5" /> ตัวอย่างรูปภาพ
              </span>
              <span className={inputImageUrl ? 'badge-mint' : 'badge-slate'}>{inputImageUrl ? 'รูปภาพที่กำหนดเอง' : 'ภาพเริ่มต้น'}</span>
            </div>
            <div className="h-48 overflow-hidden rounded-xl bg-panel">
              <img
                src={previewUrl}
                alt="Court Preview"
                onError={() => {
                  setImageError('โหลดภาพตัวอย่างไม่ได้ กรุณาตรวจสอบลิงก์หรือไฟล์');
                  setPreviewUrl(DEFAULT_COURT_PLACEHOLDER);
                }}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-panel/50 p-4 text-sm text-forest-800 hover:border-forest-500">
            <Upload className="h-4 w-4" /> เลือกไฟล์จากเครื่อง (JPG, PNG, WEBP, GIF ไม่เกิน 2MB)
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileUpload} className="hidden" />
          </label>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
            <div className="h-px flex-1 bg-slate-200" /> หรือใส่ลิงก์รูปภาพ <div className="h-px flex-1 bg-slate-200" />
          </div>
          <input
            className="input font-mono text-xs"
            value={inputImageUrl.startsWith('data:') ? '(ไฟล์จากเครื่อง)' : inputImageUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://images.unsplash.com/photo-..."
          />
          <div className="flex flex-col justify-between gap-2 border-t border-slate-100 pt-4 sm:flex-row">
            <button onClick={handleRemoveCourtImage} disabled={isSavingImage || !inputImageUrl} className="btn-danger-soft">
              ลบรูปภาพ
            </button>
            <div className="flex gap-2">
              <button onClick={() => setIsImageModalOpen(false)} className="btn-outline">
                ปิด
              </button>
              <button onClick={handleSaveCourtImage} disabled={isSavingImage} className="btn-primary">
                {isSavingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ตั้งเป็นรูปหลัก
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Create / Edit Modal */}
      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingCourt ? 'แก้ไขข้อมูลสนาม' : 'เพิ่มสนามใหม่'}>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <Alert tone="error" title={formError} />}
          <div>
            <label className="label">ประเภทกีฬา</label>
            <select className="input" value={sportTypeId} onChange={(e) => setSportTypeId(parseInt(e.target.value, 10))}>
              {sports.map((s) => (
                <option key={s.sportTypeId} value={s.sportTypeId}>
                  {sportLabel(s.name)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">ชื่อสนาม</label>
              <input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น คอร์ทแบดมินตัน A3" />
            </div>
            <div>
              <label className="label">รหัสสนาม</label>
              <input required className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น BAD-03" />
            </div>
          </div>
          <div>
            <label className="label">ตำแหน่ง / อาคาร</label>
            <input className="input" value={locationDetails} onChange={(e) => setLocationDetails(e.target.value)} placeholder="อาคาร A ชั้น 1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">ราคาต่อชั่วโมง (บาท)</label>
              <input type="number" required min={0} className="input" value={hourlyRate} onChange={(e) => setHourlyRate(parseFloat(e.target.value))} />
            </div>
            <div>
              <label className="label">สถานะ</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="AVAILABLE">พร้อมใช้งาน (AVAILABLE)</option>
                <option value="MAINTENANCE">ปิดปรับปรุง (MAINTENANCE)</option>
                <option value="CLOSED">ปิดให้บริการ (CLOSED)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">ลิงก์รูปภาพสนาม (ไม่บังคับ)</label>
            <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://images.unsplash.com/..." />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-outline">
              ยกเลิก
            </button>
            <button type="submit" disabled={isSaving} className="btn-primary">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} บันทึกข้อมูลสนาม
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="ยืนยันการปิดใช้งานสนาม">
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            ต้องการปิดใช้งานสนาม <strong>{deleteTarget?.name}</strong> ใช่หรือไม่? (Soft delete — ข้อมูลประวัติการจองยังคงอยู่)
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-outline" onClick={() => setDeleteTarget(null)}>
              ยกเลิก
            </button>
            <button className="btn-danger" onClick={() => deleteTarget && handleDelete(deleteTarget.courtId)}>
              <XCircle className="h-4 w-4" /> ปิดใช้งานสนาม
            </button>
          </div>
        </div>
      </Modal>
    </StaffLayout>
  );
};
