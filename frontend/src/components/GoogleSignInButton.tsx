import React, { useEffect, useRef, useState } from 'react';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleId {
  initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: 'popup' }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let scriptPromise: Promise<void> | null = null;
const loadGoogleScript = (): Promise<void> => {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null; // ให้ลองใหม่ได้ถ้าเครือข่ายสะดุด
      reject(new Error('โหลดบริการ Google ไม่สำเร็จ'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
};

interface Props {
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

// ปุ่ม "เข้าสู่ระบบด้วย Google" (Google Identity Services) — ได้ ID token แล้วส่งให้ backend ตรวจ
// ไม่ตั้ง VITE_GOOGLE_CLIENT_ID = ไม่แสดงปุ่ม (หน้าอื่นใช้งานปกติ)
export const GoogleSignInButton: React.FC<Props> = ({ onCredential, text = 'signin_with' }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const holder = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !holder.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => {
            if (r.credential) callbackRef.current(r.credential);
          },
        });
        window.google.accounts.id.renderButton(holder.current, { theme: 'outline', size: 'large', text, shape: 'pill', width: 320, locale: 'th' });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (!clientId) return null;
  if (failed) return <p className="text-center text-xs text-rose-600">โหลดปุ่ม Google ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองรีเฟรชหน้า</p>;
  return <div ref={holder} className="flex justify-center" aria-label="เข้าสู่ระบบด้วย Google" />;
};
