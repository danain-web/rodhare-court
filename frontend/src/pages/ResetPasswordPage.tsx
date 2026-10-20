import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPasswordApi } from '../services/auth';
import { BrandMark } from '../components/Navbar';
import { Alert, apiErrorMessage } from '../components/ui';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';

const MIN_PASSWORD_LENGTH = 10;

// ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล (/reset-password?token=...)
export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setErrorMessage(`รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
    if (password !== confirm) return setErrorMessage('ยืนยันรหัสผ่านไม่ตรงกัน');
    setIsSubmitting(true);
    try {
      await resetPasswordApi(token, password);
      setDone(true);
    } catch (err) {
      setErrorMessage(apiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md space-y-6">
        <BrandMark />
        <div>
          <span className="badge-mint">Reset Password</span>
          <h2 className="mt-2 text-3xl font-bold text-forest-950">ตั้งรหัสผ่านใหม่</h2>
        </div>

        {done ? (
          <div className="card space-y-4 p-6">
            <div className="flex items-start gap-3 text-sm text-forest-900">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-mint-600" />
              <div>
                <div className="font-semibold">ตั้งรหัสผ่านใหม่เรียบร้อย</div>
                <p className="mt-1 text-xs text-slate-600">อุปกรณ์ที่เคยเข้าสู่ระบบไว้ถูกออกจากระบบแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่</p>
              </div>
            </div>
            <Link to="/login" className="btn-primary w-full py-3">
              ไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        ) : !token ? (
          <div className="card space-y-4 p-6">
            <Alert tone="error" title="ลิงก์ไม่ถูกต้อง">
              ไม่พบรหัสรีเซ็ตในลิงก์ กรุณากดลิงก์จากอีเมลอีกครั้ง หรือขอลิงก์ใหม่
            </Alert>
            <Link to="/forgot-password" className="btn-primary w-full py-3">
              ขอลิงก์รีเซ็ตรหัสผ่านใหม่
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4 p-6">
            {errorMessage && (
              <Alert tone="error" title={errorMessage} onClose={() => setErrorMessage(null)}>
                <Link to="/forgot-password" className="font-semibold underline">
                  ขอลิงก์ใหม่
                </Link>
              </Alert>
            )}
            <div>
              <label className="label">รหัสผ่านใหม่ * (อย่างน้อย {MIN_PASSWORD_LENGTH} ตัวอักษร)</label>
              <input required type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              {tooShort && <div className="mt-1 text-[11px] text-rose-600">รหัสผ่านสั้นเกินไป</div>}
            </div>
            <div>
              <label className="label">ยืนยันรหัสผ่านใหม่ *</label>
              <input required type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              {mismatch && <div className="mt-1 text-[11px] text-rose-600">รหัสผ่านไม่ตรงกัน</div>}
            </div>
            <button type="submit" disabled={isSubmitting || tooShort || mismatch} className="btn-primary w-full py-3">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก...
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" /> บันทึกรหัสผ่านใหม่
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
