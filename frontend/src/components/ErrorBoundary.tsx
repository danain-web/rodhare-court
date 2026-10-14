import React from 'react';

// =====================================================================
// ErrorBoundary — ดักข้อผิดพลาดตอน render ของ React
// เหตุผล: ถ้าไม่มี เมื่อ component ใด throw error (เช่นอ่าน property ของ undefined)
//         React จะ unmount ทั้งแอป → หน้าเว็บขาวทั้งหน้า ผู้ใช้ไปต่อไม่ได้
//         ตัวนี้แสดงข้อความแทน และให้กดโหลดใหม่ / กลับหน้าหลักได้
// =====================================================================
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('UI error:', error, info.componentStack);
<<<<<<< HEAD
=======

    // หลัง deploy ใหม่ ไฟล์ chunk เก่า (ชื่อ hash เดิม) หายไป → โหลดหน้าใหม่ 1 ครั้งเพื่อดึงเวอร์ชันล่าสุด
    if (/dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message)) {
      try {
        if (sessionStorage.getItem('chunk-reloaded') !== '1') {
          sessionStorage.setItem('chunk-reloaded', '1');
          window.location.reload();
        }
      } catch { /* sessionStorage ใช้ไม่ได้ → แสดงหน้า error ตามปกติ */ }
    }
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-panel px-4">
        <div className="card max-w-md space-y-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold text-forest-950">เกิดข้อผิดพลาดในการแสดงผลหน้านี้</h1>
          <p className="text-sm text-slate-600">
            ข้อมูลที่ทำรายการไปแล้วยังถูกบันทึกในระบบตามปกติ ลองโหลดหน้าใหม่ หรือกลับไปหน้าหลัก
          </p>
          <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-500">{this.state.error.message}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              โหลดหน้าใหม่
            </button>
            <button className="btn-outline" onClick={() => (window.location.href = '/my-bookings')}>
              ไปที่รายการจองของฉัน
            </button>
          </div>
        </div>
      </div>
    );
  }
}
