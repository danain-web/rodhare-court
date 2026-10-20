import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordApi } from '../services/auth';
import { BrandMark } from '../components/Navbar';
import { Alert, apiErrorMessage } from '../components/ui';
import { Loader2, MailCheck, Send } from 'lucide-react';

// ลืมรหัสผ่าน: กรอกอีเมล → ระบบส่งลิงก์รีเซ็ต (หน้าจอตอบเหมือนกันเสมอ ไม่บอกว่าอีเมลนี้มีบัญชีหรือไม่)
export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await forgotPasswordApi(email.trim());
      setSent(true);
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
          <span className="badge-mint">Password Recovery</span>
          <h2 className="mt-2 text-3xl font-bold text-forest-950">ลืมรหัสผ่าน</h2>
          <p className="text-sm text-slate-500">กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้</p>
        </div>

        {sent ? (
          <div className="card space-y-4 p-6">
            <div className="flex items-start gap-3 text-sm text-forest-900">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-mint-600" />
              <div>
                <div className="font-semibold">ตรวจสอบอีเมลของคุณ</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  หากอีเมลนี้มีบัญชีอยู่ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปให้แล้ว (ลิงก์ใช้ได้ 30 นาที และใช้ได้ครั้งเดียว) ถ้าไม่พบอีเมลให้ลองดูในกล่องสแปม
                </p>
              </div>
            </div>
            <Link to="/login" className="btn-primary w-full py-3">
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4 p-6">
            {errorMessage && <Alert tone="error" title={errorMessage} onClose={() => setErrorMessage(null)} />}
            <div>
              <label className="label">อีเมล</label>
              <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
            </div>
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังส่ง...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> ส่งลิงก์รีเซ็ตรหัสผ่าน
                </>
              )}
            </button>
            <div className="text-center text-sm text-slate-600">
              นึกรหัสผ่านได้แล้ว?{' '}
              <Link to="/login" className="font-semibold text-forest-700 hover:underline">
                เข้าสู่ระบบ
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
