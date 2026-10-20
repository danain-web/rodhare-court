import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkAvailabilityApi, googleLoginApi, registerApi } from '../services/auth';
import { BrandMark } from '../components/Navbar';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { Alert } from '../components/ui';
import { CheckCircle2, Loader2, UserPlus, XCircle } from 'lucide-react';

type Check = { state: 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'; msg?: string };

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ตรวจชื่อผู้ใช้/อีเมลซ้ำกับฐานข้อมูลหลังหยุดพิมพ์ 400ms (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
const useAvailability = (field: 'username' | 'email', value: string, valid: (v: string) => boolean, invalidMsg: string): Check => {
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  useEffect(() => {
    const v = value.trim();
    if (!v) return setCheck({ state: 'idle' });
    if (!valid(v)) return setCheck({ state: 'invalid', msg: invalidMsg });
    setCheck({ state: 'checking' });
    const t = setTimeout(async () => {
      try {
        const res = await checkAvailabilityApi({ [field]: v });
        const available = field === 'username' ? res.usernameAvailable : res.emailAvailable;
        setCheck(
          available
            ? { state: 'ok', msg: field === 'username' ? 'ชื่อผู้ใช้นี้ใช้ได้' : 'อีเมลนี้ใช้ได้' }
            : { state: 'taken', msg: field === 'username' ? 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' : 'อีเมลนี้ถูกใช้งานแล้ว' }
        );
      } catch {
        setCheck({ state: 'idle' });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [value]);
  return check;
};

const Hint: React.FC<{ check: Check }> = ({ check }) => {
  if (check.state === 'idle') return null;
  if (check.state === 'checking')
    return (
      <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" /> กำลังตรวจสอบ...
      </div>
    );
  const good = check.state === 'ok';
  return (
    <div className={`mt-1 flex items-center gap-1 text-[11px] ${good ? 'text-mint-700' : 'text-rose-600'}`}>
      {good ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {check.msg}
    </div>
  );
};

const MIN_PASSWORD_LENGTH = 10;

// หน้าสมัครสมาชิก (Customer Registration)
export const RegisterPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usernameCheck = useAvailability('username', form.username, (v) => USERNAME_RE.test(v), 'ใช้ได้เฉพาะ a-z, 0-9, _ . - (3-50 ตัวอักษร)');
  const emailCheck = useAvailability('email', form.email, (v) => EMAIL_RE.test(v), 'รูปแบบอีเมลไม่ถูกต้อง');

  const passwordTooShort = form.password.length > 0 && form.password.length < MIN_PASSWORD_LENGTH;
  const passwordMismatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (usernameCheck.state === 'taken' || emailCheck.state === 'taken') {
      setErrorMessage('ชื่อผู้ใช้หรืออีเมลถูกใช้งานแล้ว กรุณาเปลี่ยนใหม่');
      return;
    }
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrorMessage('ยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    setIsSubmitting(true);
    try {
      const data = await registerApi({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
      });
      // สมัครสำเร็จ -> เข้าสู่ระบบให้อัตโนมัติ แล้วไปหน้าค้นหาสนาม
      login(data.user);

      navigate('/courts');
    } catch (err: any) {
      const details = err.response?.data?.details;
      setErrorMessage(
        Array.isArray(details) && details.length
          ? details.map((d: any) => d.message).join(', ')
          : err.response?.data?.message || err.message || 'สมัครสมาชิกไม่สำเร็จ'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setErrorMessage(null);
    try {
      const data = await googleLoginApi(credential);
      login(data.user);
      navigate('/courts');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || err.message || 'สมัครด้วย Google ไม่สำเร็จ');
    }
  };

  const blocked = isSubmitting || usernameCheck.state === 'taken' || emailCheck.state === 'taken' || passwordMismatch || passwordTooShort;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-2xl space-y-6">
        <BrandMark />
        <div>
          <span className="badge-mint">Member Registration</span>
          <h2 className="mt-2 text-3xl font-bold text-forest-950">สมัครสมาชิก</h2>
          <p className="text-sm text-slate-500">สมัครฟรี เพื่อจองสนามและยืมอุปกรณ์กีฬาออนไลน์</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5 p-6">
          {errorMessage && <Alert tone="error" title={errorMessage} onClose={() => setErrorMessage(null)} />}

          {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <div className="space-y-3">
              <GoogleSignInButton onCredential={handleGoogle} text="signup_with" />
              <p className="text-center text-[11px] text-slate-500">
                สมัครด้วยบัญชี Google ได้ทันที ไม่ต้องตั้งรหัสผ่าน · อีเมล @kkumail.com ได้สิทธิ์ส่วนลดนักศึกษาอัตโนมัติ
              </p>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <div className="h-px flex-1 bg-slate-200" /> หรือกรอกข้อมูลสมัครด้วยตนเอง <div className="h-px flex-1 bg-slate-200" />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">ชื่อผู้ใช้ (Username) *</label>
              <input required className="input" value={form.username} onChange={set('username')} placeholder="เช่น somchai_k" autoComplete="username" />
              <Hint check={usernameCheck} />
            </div>
            <div>
              <label className="label">อีเมล *</label>
              <input required type="email" className="input" value={form.email} onChange={set('email')} placeholder="name@example.com" autoComplete="email" />
              <Hint check={emailCheck} />
            </div>
            <div>
              <label className="label">ชื่อ *</label>
              <input required className="input" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
            </div>
            <div>
              <label className="label">นามสกุล *</label>
              <input required className="input" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
            </div>
            <div>
              <label className="label">รหัสผ่าน * (อย่างน้อย {MIN_PASSWORD_LENGTH} ตัวอักษร)</label>
              <input required type="password" className="input" value={form.password} onChange={set('password')} autoComplete="new-password" />
              {passwordTooShort && <div className="mt-1 text-[11px] text-rose-600">รหัสผ่านสั้นเกินไป</div>}
            </div>
            <div>
              <label className="label">ยืนยันรหัสผ่าน *</label>
              <input required type="password" className="input" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
              {passwordMismatch && <div className="mt-1 text-[11px] text-rose-600">รหัสผ่านไม่ตรงกัน</div>}
            </div>
            <div>
              <label className="label">เบอร์โทรศัพท์</label>
              <input className="input" value={form.phone} onChange={set('phone')} placeholder="08xxxxxxxx" maxLength={20} autoComplete="tel" />
            </div>
          </div>

          <p className="rounded-xl bg-panel p-3 text-[11px] text-slate-600">
            สมัครด้วยรหัสผ่านจะเป็นสมาชิกประเภทบุคคลภายนอก (ราคาปกติ) · สิทธิ์ส่วนลดนักศึกษาได้รับเมื่อสมัครหรือเชื่อมบัญชี Google ที่ใช้อีเมล @kkumail.com (ส่วนบุคลากรให้ติดต่อเจ้าหน้าที่)
          </p>

          <button type="submit" disabled={blocked} className="btn-primary w-full py-3">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> กำลังสมัครสมาชิก...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" /> สมัครสมาชิก
              </>
            )}
          </button>
          <div className="text-center text-xs text-slate-500">
            มีบัญชีอยู่แล้ว?{' '}
            <Link to="/login" className="font-semibold text-forest-700 hover:underline">
              เข้าสู่ระบบ
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};
