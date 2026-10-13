import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getHealthStatus, testErrorEndpoint } from '../services/api';
import { BrandMark } from '../components/Navbar';
import { CheckCircle2, Database, RefreshCw, Server, ShieldAlert, XCircle } from 'lucide-react';

// สถานะระบบ (Health) — ใช้ตรวจการเชื่อมต่อ Oracle ก่อน Demo
export const HealthCheckPage: React.FC = () => {
  const [testResult, setTestResult] = useState<any>(null);

  const { data: health, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['healthCheck'],
    queryFn: getHealthStatus,
    refetchInterval: 10000,
  });

  const handleTestError = async (type: string) => {
    try {
      setTestResult(null);
      await testErrorEndpoint(type);
    } catch (err: any) {
      setTestResult(err.response?.data || { message: err.message });
    }
  };

  const ok = health?.status === 'ok';
  const dbOk = health?.database === 'connected';
  const Pill: React.FC<{ good: boolean; goodText: string; badText: string }> = ({ good, goodText, badText }) =>
    isLoading ? (
      <span className="badge-amber">กำลังตรวจสอบ...</span>
    ) : good ? (
      <span className="badge-mint">
        <CheckCircle2 className="h-3.5 w-3.5" /> {goodText}
      </span>
    ) : (
      <span className="badge-rose">
        <XCircle className="h-3.5 w-3.5" /> {badText}
      </span>
    );

  return (
    <div className="min-h-screen bg-canvas p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link to="/courts">
            <BrandMark subtitle="System Health Monitor" />
          </Link>
          <button onClick={() => refetch()} disabled={isFetching} className="btn-primary">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> ตรวจสอบสถานะอีกครั้ง
          </button>
        </header>

        <div className={`rounded-2xl p-6 ${dbOk ? 'card-dark' : 'border border-rose-200 bg-rose-50'}`}>
          <div className={`text-sm ${dbOk ? 'text-mint-300' : 'text-rose-700'}`}>สถานะความพร้อมสำหรับ Demo</div>
          <div className={`text-3xl font-bold ${dbOk ? 'text-white' : 'text-rose-900'}`}>
            {isLoading ? 'กำลังตรวจสอบ...' : dbOk ? 'ระบบพร้อมใช้งาน — เชื่อมต่อฐานข้อมูลแล้ว' : 'ฐานข้อมูลยังไม่เชื่อมต่อ'}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="card space-y-3 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-100 text-forest-700">
                  <Server className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-forest-950">Backend Server</h2>
              </div>
              <Pill good={ok} goodText="ONLINE" badText="ERROR" />
            </div>
            <p className="text-sm text-slate-500">Node.js + Express + TypeScript REST API (port 5000)</p>
          </div>
          <div className="card space-y-3 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-100 text-forest-700">
                  <Database className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-forest-950">Oracle Database</h2>
              </div>
              <Pill good={dbOk} goodText="CONNECTED" badText="DISCONNECTED" />
            </div>
            <p className="text-sm text-slate-500">Connection Pool ของ Oracle 19c+ ตั้งค่าผ่านไฟล์ .env</p>
          </div>
        </div>

        <div className="card space-y-3 p-6">
          <h3 className="text-sm font-semibold text-forest-950">GET /api/health Response</h3>
          <pre className="overflow-x-auto rounded-xl bg-forest-950 p-4 font-mono text-sm text-mint-300">
            {isLoading ? 'Fetching health status...' : JSON.stringify(health, null, 2)}
          </pre>
        </div>

        <div className="card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-forest-950">ทดสอบตัวจัดการข้อผิดพลาด (Global Error Handler)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {['400', '401', '403', '404', '409', '500'].map((c) => (
              <button key={c} onClick={() => handleTestError(c)} className="btn-soft px-3 py-2 text-xs">
                HTTP {c}
              </button>
            ))}
          </div>
          {testResult && (
            <pre className="overflow-x-auto rounded-xl bg-rose-50 p-4 font-mono text-xs text-rose-800">{JSON.stringify(testResult, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
};
