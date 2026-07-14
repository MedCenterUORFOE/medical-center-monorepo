'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Stethoscope, Lock, Mail, User, ShieldAlert, CheckCircle, Loader2 } from 'lucide-react';
import api from '@/lib/axios';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '';

  // Tabs: 'email' or 'nic'
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
        payload.driver_id = identifier; // maps to NIC in backend
      }

      const response = await api.post('/auth/login', payload);
      const { data } = response;

      if (data && data.data) {
        const { token, user } = data.data;

        // Save token to client-side localStorage
        localStorage.setItem('session_token', token);
        
        // Also set token in cookie to make sure middleware reads it
        document.cookie = `session_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure=${process.env.NODE_ENV === 'production' ? 'true' : 'false'}`;

        setSuccess('Authentication successful! Redirecting...');
        
        // Brief timeout for visual feedback
        setTimeout(() => {
          if (callbackUrl) {
            router.push(callbackUrl);
            return;
          }

          // Role-based routing
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
    <div className="min-h-screen flex items-center justify-center bg-[#0d131e] relative overflow-hidden font-sans">
      {/* Decorative ambient glowing background circles */}
      <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] rounded-full bg-[#1e4620]/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] rounded-full bg-[#0d4f6d]/20 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md p-8 bg-[#151c2c]/80 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-2xl relative z-10 mx-4 transition-all duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-xl mb-4 shadow-lg shadow-emerald-500/20">
            <Stethoscope className="w-8 h-8 text-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">University Medical Center</h1>
          <p className="text-slate-400 text-sm mt-1">Management Portal</p>
        </div>

        {/* Alert Notifications */}
        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 animate-shake">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <span className="text-rose-200 text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <span className="text-emerald-200 text-sm">{success}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-5 h-5" />
              </span>
              <input
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="doctor@medcenter.lk"
                className="w-full pl-11 pr-4 py-3 bg-[#0d131e]/90 text-white rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-600 transition-all text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-[#0d131e]/90 text-white rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-600 transition-all text-sm"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-950/20 disabled:opacity-50 disabled:cursor-not-allowed mt-8 focus:ring-2 focus:ring-emerald-500/50 outline-none"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
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
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0d131e] text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
