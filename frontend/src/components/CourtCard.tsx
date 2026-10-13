import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Court } from '../types/court';
import { ArrowRight, ImageOff, Info, MapPin, Layers } from 'lucide-react';
import { StatusBadge } from './ui/StatusBadge';
import { formatTHB, sportLabel } from './ui/format';
import { AvailabilitySlot } from '../types/court';

interface CourtCardProps {
  court: Court;
  // ช่วงเวลาว่างจริงจาก /courts/:id/availability (ถ้าหน้าค้นหาส่งมาให้)
  slots?: AvailabilitySlot[];
  date?: string;
}

// การ์ดสนาม ตาม Prototype UCS-2.1 (รูปเต็มด้านบน + ชื่อ/ราคาบนรูป + ชิปเวลาว่าง + ปุ่มดูตารางเวลา)
export const CourtCard: React.FC<CourtCardProps> = ({ court, slots, date }) => {
  const [imgError, setImgError] = useState(false);
  const available = (slots || []).filter((s) => s.status === 'AVAILABLE');
  const detailUrl = `/courts/${court.courtId}${date ? `?date=${date}` : ''}`;

  return (
    <div className="card group flex flex-col overflow-hidden">
      <div className="relative h-56 w-full overflow-hidden bg-forest-900">
        {court.imageUrl && !imgError ? (
          <img
            src={court.imageUrl}
            alt={court.name}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-forest-700 to-forest-950 text-forest-200">
            <ImageOff className="h-10 w-10" />
            <span className="text-xs">ยังไม่มีรูปภาพสนาม</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/90 via-forest-950/10 to-transparent" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {slots && (
            <span className="badge bg-white/95 text-forest-800 shadow">
              <span className={`h-1.5 w-1.5 rounded-full ${available.length ? 'bg-mint-500' : 'bg-rose-500'}`} />
              ว่าง {available.length} ช่วงเวลา
            </span>
          )}
          <span className="badge bg-white/85 text-slate-700">{sportLabel(court.sportName)}</span>
        </div>
        <div className="absolute right-3 top-3">
          <StatusBadge status={court.status} className="shadow" />
        </div>

        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3 text-white">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-mint-200">
              {court.sportName} COURT #{court.code}
            </div>
            <div className="truncate text-xl font-bold">{court.name}</div>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-2xl font-bold text-mint-300">{formatTHB(court.hourlyRate, 0)}</span>
            <span className="text-[11px] text-white/80"> / ชม.</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-forest-600" />
            <span className="truncate">{court.locationDetails || 'Barbie Sports Arena'}</span>
          </span>
          <span className="badge-mint shrink-0">
            <Layers className="h-3 w-3" /> {court.code}
          </span>
        </div>

        {slots && (
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-600">ช่วงเวลาว่างแนะนำ ({available.length ? 'แตะเพื่อจอง' : 'เต็มทุกช่วง'}):</div>
            {available.length ? (
              <div className="grid grid-cols-3 gap-2">
                {available.slice(0, 3).map((s) => (
                  <Link
                    key={s.startTime}
                    to={detailUrl}
                    className="rounded-lg bg-panel px-2 py-2 text-center text-xs font-semibold text-forest-900 transition hover:bg-mint-100"
                  >
                    {s.startTime} - {s.endTime}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">ไม่มีช่วงเวลาว่างในวันที่เลือก ลองเลือกวันอื่น</div>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2">
          <Link to={detailUrl} className="btn-primary flex-1">
            ดูตารางเวลา Real-time <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to={detailUrl} className="btn-soft px-3" title="รายละเอียดและค่าบริการ">
            <Info className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};
