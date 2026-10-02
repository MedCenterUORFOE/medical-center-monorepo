'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Stethoscope, Lock, Mail, ShieldAlert, CheckCircle, Loader2 } from 'lucide-react';
import api from '@/lib/axios';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '';

  const [loginMethod, setLoginMethod] = useState<'email' | 'nic'>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!identifier || !password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    try {
      const payload: Record<string, string> = { password };
      if (loginMethod === 'email') {
        payload.email = identifier;
      } else {
        payload.driver_id = identifier;
      }

      const response = await api.post('/auth/login', payload);
      const { data } = response;

      if (data && data.data) {
        const { token, user } = data.data;
        localStorage.setItem('session_token', token);

        setSuccess('Authentication successful! Redirecting...');

        setTimeout(() => {
          if (callbackUrl) {
            router.push(callbackUrl);
            return;
          }

          switch (user.role) {
            case 'ADMIN':
              router.push('/admin/staff/new');
              break;
            case 'DOCTOR':
              router.push('/dashboard/doctor');
              break;
            case 'NURSE':
              router.push('/dashboard/nurse');
              break;
            case 'PHARMACIST':
              router.push('/dashboard/pharmacist');
              break;
            default:
              router.push('/');
          }
        }, 1000);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.response && err.response.data) {
        setError(err.response.data.error || 'Invalid credentials');
      } else {
        setError('Connection failed. Please check your backend database.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="absolute left-[-12%] top-[-12%] h-[24rem] w-[24rem] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="absolute bottom-[-8%] right-[-8%] h-[20rem] w-[20rem] rounded-full bg-cyan-500/10 blur-[120px]" />

      <div className="auth-card mx-4">
        <div className="flex flex-col items-center text-center">
          <div className="brand-mark mb-5">
            <Stethoscope className="h-8 w-8 text-white" />
          </div>

          <h1 className="text-[2rem] font-extrabold tracking-[-0.06em] text-white">
            University Medical Center
          </h1>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-200">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-200">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              {loginMethod === 'email' ? 'Email Address' : 'Staff ID'}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Mail className="h-5 w-5" />
              </span>
              <input
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={loginMethod === 'email' ? 'doctor@medcenter.lk' : 'e.g. MED-1042'}
                className="form-input py-3 pl-11 pr-4 text-sm placeholder:text-slate-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Password
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Lock className="h-5 w-5" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input py-3 pl-11 pr-4 text-sm placeholder:text-slate-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="primary-cta mt-7 flex w-full items-center justify-center gap-2 px-5 py-3.5 text-sm disabled:opacity-60 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Sign In to Dashboard</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-shell text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
