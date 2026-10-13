import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginApi } from '../services/auth';
import { BrandMark } from '../components/Navbar';
import { Alert } from '../components/ui';
import { Briefcase, CalendarCheck, KeyRound, Loader2, ShieldCheck, Timer, UserCheck, UserCog, Users } from 'lucide-react';

// หน้าเข้าสู่ระบบ (BR1) — ออกแบบใหม่ตาม Design System ของ Prototype
export const LoginPage: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (idVal: string, passVal: string) => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const data = await loginApi(idVal, passVal);
      // Backend set httpOnly Cookie อัตโนมัติ — ส่งแค่ user data มาเก็บใน context
      login(data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || err.message || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin(identifier, password);
  };

  const fillAndLogin = (user: string, pass: string) => {
    setIdentifier(user);
    setPassword(pass);
    handleLogin(user, pass);
  };

  const demo = [
    { u: 'customer1', role: 'CUSTOMER', label: 'ลูกค้า (บุคคลภายนอก)', icon: <UserCheck className="h-4 w-4" /> },
    { u: 'customer2', role: 'CUSTOMER', label: 'ลูกค้า (นักศึกษา -10%)', icon: <Users className="h-4 w-4" /> },
    { u: 'staff1', role: 'STAFF', label: 'พนักงานสนาม', icon: <UserCog className="h-4 w-4" /> },
    { u: 'admin1', role: 'ADMIN', label: 'ผู้ดูแลระบบ', icon: <ShieldCheck className="h-4 w-4" /> },
    { u: 'exec1', role: 'EXECUTIVE', label: 'ผู้บริหาร', icon: <Briefcase className="h-4 w-4" /> },
  ];

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.1fr_1fr]">
      {/* ฝั่งแบรนด์ */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-forest-800 via-forest-900 to-forest-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-mint-300/10" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-mint-300/5" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint-300 text-lg font-extrabold text-forest-950">B</div>
          <div>
            <div className="text-xl font-bold text-white">Barbie Sports Arena</div>
            <div className="text-xs text-mint-200">ศูนย์กีฬาและบริการยืมอุปกรณ์ออนไลน์</div>
          </div>
        </div>
        <div className="relative space-y-5">
          <h1 className="text-4xl font-bold leading-tight text-white">
            จองสนามกีฬาออนไลน์
            <br />
            <span className="text-mint-300">แม่นยำ ไร้การจองซ้อน</span>
          </h1>
          <p className="max-w-md text-sm text-white/70">ตารางเวลาว่างแบบ Real-time ชำระผ่าน PromptPay พร้อมใบเสร็จอิเล็กทรอนิกส์และบัตรผ่านดิจิทัล</p>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {[
              { i: <CalendarCheck className="h-5 w-5" />, t: 'BR2', d: 'กันจองทับซ้อน' },
              { i: <Timer className="h-5 w-5" />, t: 'BR3', d: 'ล็อกสนาม 15 นาที' },
              { i: <ShieldCheck className="h-5 w-5" />, t: 'BR6', d: 'ตรวจยอดสลิป' },
            ].map((x) => (
              <div key={x.t} className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <div className="text-mint-300">{x.i}</div>
                <div className="mt-2 text-sm font-semibold">{x.t}</div>
                <div className="text-[11px] text-white/70">{x.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-white/50">© 2026 Barbie Sports Arena — CP422022 Database Term Project</div>
      </div>

      {/* ฟอร์มเข้าสู่ระบบ */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div>
            <span className="badge-mint">BR1 Member Login</span>
            <h2 className="mt-2 text-3xl font-bold text-forest-950">เข้าสู่ระบบ</h2>
            <p className="text-sm text-slate-500">สมาชิกต้องเข้าสู่ระบบก่อนทำการจองสนาม</p>
          </div>

          <form onSubmit={handleSubmit} className="card space-y-4 p-6">
            {errorMessage && <Alert tone="error" title={errorMessage} onClose={() => setErrorMessage(null)} />}
            <div>
              <label className="label">ชื่อผู้ใช้ หรือ อีเมล</label>
              <input type="text" required className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="เช่น customer1" />
            </div>
            <div>
              <label className="label">รหัสผ่าน</label>
              <input type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังเข้าสู่ระบบ...
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" /> เข้าสู่ระบบ
                </>
              )}
            </button>
            <div className="text-center text-sm text-slate-600">
              ยังไม่มีบัญชี?{' '}
              <Link to="/register" className="font-semibold text-forest-700 hover:underline">
                สมัครสมาชิก
              </Link>
            </div>
            <Link to="/courts" className="block text-center text-xs text-slate-500 hover:text-forest-700">
              ดูสนามและตารางเวลาว่างโดยไม่ต้องเข้าสู่ระบบ →
            </Link>
          </form>

          <div className="card-soft space-y-3 p-5">
            <div className="text-center text-xs font-semibold text-forest-800">⚡ บัญชีทดสอบสำหรับ Demo (รหัสผ่าน Password123!)</div>
            <div className="grid grid-cols-2 gap-2">
              {demo.map((a) => (
                <button
                  key={a.u}
                  onClick={() => fillAndLogin(a.u, 'Password123!')}
                  className="flex items-center gap-2 rounded-xl bg-white p-3 text-left shadow-sm transition hover:ring-2 hover:ring-mint-200"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint-100 text-forest-800">{a.icon}</span>
                  <span>
                    <span className="block text-xs font-semibold text-forest-950">{a.label}</span>
                    <span className="block font-mono text-[10px] text-slate-500">{a.u}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
