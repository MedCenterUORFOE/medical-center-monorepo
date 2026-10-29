'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, Loader2, LockKeyhole, LogOut, UserCircle, X } from 'lucide-react';
import api from '@/lib/axios';

interface SessionUser {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
}

function readSessionUser(): SessionUser {
  if (typeof window === 'undefined') return {};

  let tokenUser: SessionUser = {};
  const token = localStorage.getItem('session_token');
  if (token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
      tokenUser = JSON.parse(atob(base64)) as SessionUser;
    } catch {
      tokenUser = {};
    }
  }

  const storedUser = localStorage.getItem('session_user');
  if (storedUser) {
    try {
      const parsedUser = JSON.parse(storedUser) as SessionUser;
      const mergedUser = { ...tokenUser, ...parsedUser };
      if (tokenUser.email && !mergedUser.email) mergedUser.email = tokenUser.email;
      if (mergedUser.name?.trim() || mergedUser.email) {
        localStorage.setItem('session_user', JSON.stringify(mergedUser));
        return mergedUser;
      }
    } catch {
      localStorage.removeItem('session_user');
    }
  }

  if (tokenUser.name?.trim() || tokenUser.email) {
    localStorage.setItem('session_user', JSON.stringify(tokenUser));
  }
  return tokenUser;
}

export default function UserProfilePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [user, setUser] = useState<SessionUser>({});
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setUser(readSessionUser());
  }, []);

  const handlePasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }

    setSavingPassword(true);
    try {
      const response = await api.patch('/auth/change-password', {
        oldPassword,
        newPassword,
      });
      setMessage({ type: 'success', text: response.data?.message || 'Password changed successfully.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to change password.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const displayName = user.name?.trim() || 'Profile';
  const role = user.role?.replace(/_/g, ' ') || 'Account';

  const handleSignOut = () => {
    localStorage.removeItem('session_token');
    localStorage.removeItem('session_user');
    document.cookie = 'session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    window.location.href = '/login';
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setMessage(null);
        }}
        className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/70 px-3 py-2 text-left transition-colors hover:border-emerald-500/40 hover:bg-slate-800"
        aria-label="Open profile"
      >
        <UserCircle className="h-5 w-5 text-emerald-400" />
        <span className="max-w-36 truncate text-xs font-bold text-slate-200">{displayName}</span>
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close profile"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <aside className="absolute bottom-0 right-0 top-0 h-screen w-full max-w-sm overflow-y-auto border-l border-slate-700/80 bg-[#0d1726] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-5">
              <div className="flex items-center gap-3">
                <UserCircle className="h-9 w-9 text-emerald-400" />
                <div>
                  <h2 className="text-sm font-extrabold text-white">My Profile</h2>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{role}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                aria-label="Close profile"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-[#111c2c] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Name</p>
                <p className="mt-1 text-sm font-semibold text-white">{displayName}</p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</p>
                <p className="mt-1 break-all text-xs text-slate-300">{user.email || 'Not available'}</p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Role</p>
                <p className="mt-1 text-xs font-semibold capitalize text-slate-300">{role.toLowerCase()}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsPasswordFormOpen((open) => !open);
                  setMessage(null);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20"
              >
                <KeyRound className="h-4 w-4" />
                {isPasswordFormOpen ? 'Close Password Form' : 'Change Password'}
              </button>

              {isPasswordFormOpen && (
                <form onSubmit={handlePasswordChange} className="space-y-3 rounded-xl border border-slate-800 bg-[#111c2c] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                    <LockKeyhole className="h-4 w-4 text-emerald-400" />
                    Update Password
                  </div>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                    placeholder="Current password"
                    required
                    className="w-full rounded-lg border border-slate-800 bg-[#0b0f19] px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password (min. 8 characters)"
                    minLength={8}
                    required
                    className="w-full rounded-lg border border-slate-800 bg-[#0b0f19] px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirm new password"
                    minLength={8}
                    required
                    className="w-full rounded-lg border border-slate-800 bg-[#0b0f19] px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                  {message && (
                    <p className={`text-xs ${message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {message.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                    {savingPassword ? 'Saving...' : 'Save New Password'}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-400 transition-colors hover:bg-rose-500/20"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}
