import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getReceiptByBookingApi } from '../services/payment';
import { getBookingByIdApi } from '../services/booking';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import { Breadcrumb, EmptyState, LoadingState, formatDateTime, formatTHB, formatThaiDate } from '../components/ui';
import { ArrowLeft, BadgeCheck, CheckCircle2, Clock, LogIn, Printer, QrCode, ReceiptText, RotateCcw, ShieldCheck, Undo2 } from 'lucide-react';

const minusMinutes = (time?: string, minutes = 30) => {
  if (!time) return '-';
  const [h, m] = time.split(':').map(Number);
  const total = Math.max(0, h * 60 + m - minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// UCS-4.3 ตรวจสอบสลิปและใบเสร็จรับเงิน (Digital Pass & Receipt)
export const ReceiptPage: React.FC = () => {
  const { bookingId: paramId } = useParams<{ bookingId: string }>();
  const bookingId = parseInt(paramId || '1', 10);

  const { data: receipt, isLoading } = useQuery({
    queryKey: ['receipt', bookingId],
    queryFn: () => getReceiptByBookingApi(bookingId),
    retry: false,
  });

  const { data: booking } = useQuery({
    queryKey: ['bookingDetail', bookingId],
    queryFn: () => getBookingByIdApi(bookingId),
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <CustomerLayout>
        <LoadingState label="กำลังโหลดใบเสร็จรับเงิน..." />
      </CustomerLayout>
    );
  }

  if (!receipt) {
    return (
      <CustomerLayout>
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="ยังไม่มีใบเสร็จรับเงิน"
          description="ใบเสร็จจะถูกออกอัตโนมัติเมื่อเจ้าหน้าที่อนุมัติสลิปการชำระเงินแล้ว (UC-7)"
          action={
            <Link to={`/my-bookings/${bookingId}`} className="btn-primary">
              กลับไปหน้ารายละเอียดการจอง
            </Link>
          }
        />
      </CustomerLayout>
    );
  }

  const r: any = receipt;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&color=0a3528&data=${encodeURIComponent(receipt.bookingNumber || '')}`;
  const lines = [
    {
      title: `ค่าบริการคอร์ท ${receipt.courtName || ''}`,
      sub: `${formatThaiDate(receipt.bookingDate)} (${receipt.startTime} - ${receipt.endTime} น.)`,
      qty: '-',
      amount: r.totalCourtFee,
    },
    ...((booking?.equipment || []).map((e) => ({
      title: `บริการยืม${e.equipmentName}`,
      sub: `อุปกรณ์เสริม (EQ-${e.equipmentId})`,
      qty: `${e.quantity} ชิ้น × ${formatTHB(e.unitRentalFee, 0)}`,
      amount: e.subtotal,
    })) as any[]),
  ];

  return (
    <CustomerLayout>
      <div className="print:hidden">
        <Breadcrumb
          items={[
            { label: 'ประวัติการจอง', to: '/my-bookings' },
            { label: `การจอง #${receipt.bookingNumber}`, to: `/my-bookings/${bookingId}` },
            { label: 'ใบเสร็จรับเงิน' },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-mint-200 bg-mint-50 p-5 md:flex-row md:items-center md:justify-between print:hidden">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint-500 text-white">
            <BadgeCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-forest-950">ชำระเงินและตรวจสอบสลิปสำเร็จ</span>
              <span className="badge-mint">PAID & CONFIRMED</span>
            </div>
            <div className="text-xs text-slate-600">เจ้าหน้าที่ตรวจสอบสลิปเรียบร้อยแล้ว สิทธิ์สนามของคุณพร้อมใช้งาน</div>
          </div>
        </div>
        <span className="badge bg-white py-1.5 text-forest-800 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-mint-500" /> อนุมัติเมื่อ {formatDateTime(receipt.issuedAt)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {/* Digital Pass */}
        <div className="space-y-6 print:hidden">
          <div className="card space-y-5 bg-gradient-to-b from-white to-mint-50 p-6">
            <div className="flex items-center justify-between">
              <span className="badge-forest">DIGITAL PASS</span>
              <span className="text-[11px] text-slate-500">เช็คอินก่อนเวลา 30 นาที (BR8)</span>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-forest-950">บัตรผ่านเข้าสนามดิจิทัล</h2>
              <p className="text-xs text-slate-500">แสดง QR Code นี้แก่เจ้าหน้าที่หน้าเคาน์เตอร์เพื่อยืนยันตัวตนและรับอุปกรณ์</p>
            </div>
            <div className="mx-auto w-fit rounded-2xl bg-panel p-5">
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <img src={qrUrl} alt="QR Code การจอง" className="h-44 w-44" />
              </div>
              <div className="mt-3 text-center text-sm font-semibold text-forest-950">
                <QrCode className="mr-1 inline h-4 w-4" />
                {receipt.bookingNumber}
              </div>
              <div className="text-center text-[11px] text-slate-500">
                ใช้เช็คอินได้ตั้งแต่: {formatThaiDate(receipt.bookingDate, 'short')}, {minusMinutes(receipt.startTime)} น.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-panel p-3">
                <div className="text-[10px] text-slate-500">สนามและประเภทกีฬา</div>
                <div className="text-sm font-semibold text-forest-950">{receipt.courtName}</div>
              </div>
              <div className="rounded-xl bg-panel p-3">
                <div className="text-[10px] text-slate-500">ช่วงเวลาจอง</div>
                <div className="text-sm font-semibold text-forest-700">
                  {receipt.startTime} - {receipt.endTime} น.
                </div>
                <div className="text-[10px] text-slate-500">{formatThaiDate(receipt.bookingDate, 'short')}</div>
              </div>
            </div>
            <button onClick={handlePrint} className="btn-primary w-full">
              <Printer className="h-4 w-4" /> พิมพ์ / บันทึกเป็น PDF
            </button>
          </div>
        </div>

        {/* ใบเสร็จรับเงิน */}
        <div className="card overflow-hidden print:shadow-none">
          <div className="flex items-center justify-between gap-4 bg-forest-900 px-6 py-5 text-white">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                <ReceiptText className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-mint-200">Official Electronic Receipt</div>
                <div className="text-2xl font-bold text-white">ใบเสร็จรับเงิน</div>
              </div>
            </div>
            <div className="text-right">
              <span className="badge bg-mint-300 text-forest-950">ชำระเต็มจำนวนแล้ว</span>
              <div className="mt-1 text-[11px] text-white/70">ต้นฉบับอิเล็กทรอนิกส์ (Original)</div>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <div className="grid gap-4 rounded-2xl bg-panel p-5 text-xs sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold uppercase text-slate-500">ผู้ออกเอกสาร (Issuer)</div>
                <div className="text-sm font-semibold text-forest-950">Barbie Sports Arena</div>
                <div className="text-slate-500">ออกโดย: {r.issuedByName || '-'}{r.verificationMethod === 'AUTO' ? ' (ตรวจสลิปอัตโนมัติ)' : ''}</div>
              </div>
              <div className="space-y-1">
                {[
                  ['เลขที่ใบเสร็จ:', receipt.receiptNumber],
                  ['รหัสการจอง:', `#${receipt.bookingNumber}`],
                  ['วันที่-เวลาออกเอกสาร:', formatDateTime(receipt.issuedAt)],
                  ['ลูกค้า:', r.customerName || receipt.userName],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-semibold text-forest-950">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-panel text-left text-[11px] text-slate-600">
                    <th className="rounded-l-lg px-3 py-2">ลำดับ</th>
                    <th className="px-3 py-2">รายละเอียดบริการ</th>
                    <th className="px-3 py-2">จำนวน</th>
                    <th className="rounded-r-lg px-3 py-2 text-right">จำนวนเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-3 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-forest-950">{l.title}</div>
                        <div className="text-[11px] text-slate-500">{l.sub}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{l.qty}</td>
                      <td className="px-3 py-3 text-right font-semibold">{l.amount !== undefined ? formatTHB(l.amount).replace('฿', '') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-panel p-4 text-xs">
                <div className="mb-2 flex items-center gap-1.5 font-semibold text-forest-900">
                  <CheckCircle2 className="h-4 w-4 text-mint-600" /> ข้อมูลการชำระเงินที่ผ่านการตรวจสอบ
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">ช่องทางชำระ:</span>
                    <span className="font-semibold">{receipt.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">รหัสอ้างอิงสลิป:</span>
                    <span className="font-mono font-semibold">{r.slipReference || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ตรวจสอบโดย:</span>
                    <span className="badge-mint">เจ้าหน้าที่ (UC-7) • BR6 ยอดตรง</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">รวมค่าบริการ (Subtotal):</span>
                  <span>{formatTHB((r.totalCourtFee || 0) + (r.totalEquipmentFee || 0))}</span>
                </div>
                {(r.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>ส่วนลดสมาชิก/โปรโมชั่น:</span>
                    <span>-{formatTHB(r.discountAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-xl bg-forest-900 px-4 py-3 text-white">
                  <span className="text-sm font-semibold">ยอดสุทธิชำระทั้งสิ้น:</span>
                  <span className="text-2xl font-bold">{formatTHB(receipt.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <div className="flex h-14 w-14 rotate-[-12deg] items-center justify-center rounded-full border-2 border-dashed border-forest-600 text-center text-[9px] font-bold leading-tight text-forest-700">
                  BARBIE
                  <br />
                  PAID
                </div>
                เอกสารนี้ออกโดยระบบอิเล็กทรอนิกส์ของ Barbie Sports Arena
              </div>
              <button onClick={handlePrint} className="btn-soft print:hidden">
                <Printer className="h-4 w-4" /> พิมพ์ใบเสร็จ
              </button>
            </div>
          </div>
        </div>
      </div>

      <section className="card space-y-4 p-6 print:hidden">
        <h2 className="flex items-center gap-2 text-lg font-bold text-forest-950">
          <Clock className="h-5 w-5" /> ข้อกำหนดและระเบียบการเข้าใช้งาน (Usage Guidelines & Policies)
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: <LogIn className="h-4 w-4" />, t: 'การเช็คอิน (BR8)', d: 'เช็คอินได้ก่อนเวลาเริ่มไม่เกิน 30 นาที แสดง QR Code แก่เจ้าหน้าที่หน้าเคาน์เตอร์' },
            { icon: <RotateCcw className="h-4 w-4" />, t: 'การคืนอุปกรณ์ (BR10, BR11)', d: 'คืนภายในเวลาสิ้นสุดการจอง หากเกินคิดค่าปรับ 20 บาท / 15 นาที / ชิ้น' },
            { icon: <Undo2 className="h-4 w-4" />, t: 'สิทธิ์ยกเลิก (BR12)', d: 'ยกเลิกล่วงหน้ามากกว่า 24 ชม. คืนเงิน 100% น้อยกว่า 24 ชม. คืนเงิน 50%' },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl bg-panel p-4">
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-forest-700">{x.icon}</div>
              <div className="text-sm font-semibold text-forest-950">{x.t}</div>
              <p className="mt-1 text-xs text-slate-500">{x.d}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <Link to="/my-bookings" className="inline-flex items-center gap-2 text-sm font-semibold text-forest-800 hover:underline">
            <ArrowLeft className="h-4 w-4" /> กลับสู่หน้ารายการจองของฉัน (My Bookings)
          </Link>
          <Link to="/courts" className="btn-primary">
            ค้นหาสนามอื่นเพิ่มเติม
          </Link>
        </div>
      </section>
    </CustomerLayout>
  );
};
