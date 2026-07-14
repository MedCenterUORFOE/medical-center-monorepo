'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Stethoscope, Lock, CheckCircle, ShieldAlert, Loader2 } from 'lucide-react';
import api from '@/lib/axios';

function SetupAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid URL: Setup token is missing. Please check your invitation email.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError('Setup token is missing. Cannot complete account activation.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // Endpoint requires token and newPassword in a PATCH request as verified in the route handler
      const response = await api.patch('/auth/reset-password', {
        token,
        newPassword
      });

      setSuccess(response.data.message || 'Password established successfully! Your account is active.');
      
      // Redirect to login after brief timeout
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      console.error('Account setup error:', err);
      if (err.response && err.response.data) {
        setError(err.response.data.error || 'Failed to establish password');
      } else {
        setError('Connection failed. Please check your backend.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d131e] relative overflow-hidden font-sans">
      {/* Glow backgrounds */}
      <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] rounded-full bg-[#1e4620]/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] rounded-full bg-[#0d4f6d]/20 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md p-8 bg-[#151c2c]/80 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-2xl relative z-10 mx-4">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-xl mb-4 shadow-lg shadow-emerald-500/20">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Setup Your Account</h1>
          <p className="text-slate-400 text-sm mt-1">University Medical Center Staff</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
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

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">New Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-[#0d131e]/90 text-white rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-600 transition-all text-sm"
                required
                disabled={!token || loading}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Must be at least 8 characters long</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirm Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-[#0d131e]/90 text-white rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-600 transition-all text-sm"
                required
                disabled={!token || loading}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!token || loading}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-950/20 disabled:opacity-50 disabled:cursor-not-allowed mt-8 focus:ring-2 focus:ring-emerald-500/50 outline-none"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Activating Account...</span>
              </>
            ) : (
              <span>Establish Password</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SetupAccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0d131e] text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    }>
      <SetupAccountContent />
    </Suspense>
  );
}
