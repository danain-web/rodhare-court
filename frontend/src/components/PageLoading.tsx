import React from 'react';
import { Loader2 } from 'lucide-react';

// แสดงระหว่างโหลดไฟล์ของหน้าที่แยกโหลด (React.lazy)
export const PageLoading: React.FC = () => (
  <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center bg-canvas text-forest-900">
    <div className="flex items-center gap-3 text-sm">
      <Loader2 className="h-6 w-6 animate-spin text-forest-600" aria-hidden="true" />
      <span>กำลังโหลดหน้า...</span>
    </div>
  </div>
);
