'use client';

import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import {
  UserPlus,
  Mail,
  User,
  Shield,
  Briefcase,
  Key,
  IdCard,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Users,
  Edit3,
  Trash2,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
  Lock,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import api from '@/lib/axios';

const MEDICAL_ROLES = ['DOCTOR', 'NURSE', 'PHARMACIST'] as const;

const ROLES = [
  { value: 'DOCTOR', label: 'Doctor' },
  { value: 'NURSE', label: 'Nurse' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'AMBULANCE_DRIVER', label: 'Ambulance Driver' },
  { value: 'ADMIN', label: 'System Administrator' },
];

// Client-side schema matching the server's provisionSchema and superRefine rules
const createStaffSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    role: z.enum(['DOCTOR', 'NURSE', 'PHARMACIST', 'ADMIN', 'AMBULANCE_DRIVER']),
    nic: z.string().min(10, 'NIC must be at least 10 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm password'),
    university_staff_id: z.string().optional(),
    license_number: z.string().optional(),
    specialization: z.string().optional(),
    vehicle_registration: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }

    const isMedical = (MEDICAL_ROLES as readonly string[]).includes(data.role);
    const isDriver = data.role === 'AMBULANCE_DRIVER';

    if ((isMedical || isDriver) && (!data.university_staff_id || data.university_staff_id.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'University staff ID is required for this role',
        path: ['university_staff_id'],
      });
    }

    if (isMedical && (!data.license_number || data.license_number.trim().length < 4)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Valid license number (min 4 characters) is required',
        path: ['license_number'],
      });
    }

    if (data.role === 'DOCTOR' && (!data.specialization || data.specialization.trim().length < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Specialization (min 2 characters) is required for doctors',
        path: ['specialization'],
      });
    }

    if (isDriver && (!data.vehicle_registration || data.vehicle_registration.trim().length < 4)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Vehicle registration (min 4 characters) is required for ambulance drivers',
        path: ['vehicle_registration'],
      });
    }
  });

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'provision' | 'directory'>('provision');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Directory state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Edit State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editNic, setEditNic] = useState('');
  const [editStaffId, setEditStaffId] = useState('');
  const [editLicense, setEditLicense] = useState('');
  const [editSpecialization, setEditSpecialization] = useState('');
  const [editVehicle, setEditVehicle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Provisioning Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [nic, setNic] = useState('');
  const [role, setRole] = useState<'DOCTOR' | 'NURSE' | 'PHARMACIST' | 'ADMIN' | 'AMBULANCE_DRIVER'>('DOCTOR');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [universityStaffId, setUniversityStaffId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [vehicleRegistration, setVehicleRegistration] = useState('');

  // Password UX States
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Field-level error state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // UI Status
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Admin access guard
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('session_token');
      if (!token) {
        window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
        const payload = JSON.parse(atob(base64));
        if (payload.role !== 'ADMIN') {
          window.location.href = '/unauthorized';
          return;
        }
      } catch {
        window.location.href = '/login';
        return;
      } finally {
        setCheckingAuth(false);
      }
    }
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 6000);
  };

  // Generate secure random password
  const handleGeneratePassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const special = '!@#$%^&*_-+=';
    const all = upper + lower + numbers + special;

    const chars = [
      upper[Math.floor(Math.random() * upper.length)],
      lower[Math.floor(Math.random() * lower.length)],
      numbers[Math.floor(Math.random() * numbers.length)],
      special[Math.floor(Math.random() * special.length)],
    ];
    for (let i = 0; i < 10; i++) {
      chars.push(all[Math.floor(Math.random() * all.length)]);
    }
    const generated = chars.sort(() => 0.5 - Math.random()).join('');
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
    setShowConfirmPassword(true);

    // Clear password inline errors
    setFieldErrors((prev) => {
      const updated = { ...prev };
      delete updated.password;
      delete updated.confirmPassword;
      return updated;
    });
  };

  // Fetch staff directory
  const fetchDirectory = async () => {
    setLoadingList(true);
    try {
      const response = await api.get('/admin/users', {
        params: {
          search: searchTerm || undefined,
          role: roleFilter || undefined,
          limit: 100,
        },
      });
      if (response.data && response.data.success) {
        const staff = (response.data.data.users || []).filter((u: any) => u.role !== 'STUDENT');
        setUsers(staff);
      }
    } catch {
      showToast('error', 'Failed to load staff directory.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'directory') {
      fetchDirectory();
    }
  }, [activeTab, roleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDirectory();
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as 'DOCTOR' | 'NURSE' | 'PHARMACIST' | 'ADMIN' | 'AMBULANCE_DRIVER';
    setRole(newRole);
    setUniversityStaffId('');
    setLicenseNumber('');
    setSpecialization('');
    setVehicleRegistration('');
    setFieldErrors({});
  };

  // Provision new user (Flow A)
  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);
    setFieldErrors({});

    const formData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      nic: nic.trim(),
      password,
      confirmPassword,
      university_staff_id: universityStaffId.trim() || undefined,
      license_number: licenseNumber.trim() || undefined,
      specialization: specialization.trim() || undefined,
      vehicle_registration: vehicleRegistration.trim() || undefined,
    };

    // Client-side Zod validation
    const validationResult = createStaffSchema.safeParse(formData);
    if (!validationResult.success) {
      const errMap: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        const fieldName = err.path[0] as string;
        if (fieldName && !errMap[fieldName]) {
          errMap[fieldName] = err.message;
        }
      });
      setFieldErrors(errMap);
      showToast('error', 'Please resolve the highlighted validation errors.');
      return;
    }

    setSubmitting(true);

    // Build payload without confirmPassword
    const isMedical = (MEDICAL_ROLES as readonly string[]).includes(role);
    const isDriver = role === 'AMBULANCE_DRIVER';

    const payload: Record<string, string> = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      nic: formData.nic,
      password: formData.password,
    };

    if ((isMedical || isDriver) && formData.university_staff_id) {
      payload.university_staff_id = formData.university_staff_id;
    }
    if (isMedical && formData.license_number) {
      payload.license_number = formData.license_number;
    }
    if (role === 'DOCTOR' && formData.specialization) {
      payload.specialization = formData.specialization;
    }
    if (isDriver && formData.vehicle_registration) {
      payload.vehicle_registration = formData.vehicle_registration;
    }

    try {
      const response = await api.post('/admin/users', payload);

      // 201 Success: Reset form completely and clear password state
      setName('');
      setEmail('');
      setNic('');
      setPassword('');
      setConfirmPassword('');
      setUniversityStaffId('');
      setLicenseNumber('');
      setSpecialization('');
      setVehicleRegistration('');
      setRole('DOCTOR');
      setFieldErrors({});

      showToast(
        'success',
        response.data?.message || `${role} account successfully created and verified. Staff can now log in.`
      );

      // Refresh directory list in background
      fetchDirectory();
    } catch (err: any) {
      const errorData = err.response?.data;
      const status = err.response?.status;

      if (status === 400 && errorData?.errors && Array.isArray(errorData.errors)) {
        // Map server validation errors to inline fields
        const errMap: Record<string, string> = {};
        errorData.errors.forEach((e: any) => {
          const field = e.path?.[0];
          if (field) errMap[field] = e.message;
        });
        setFieldErrors(errMap);
        showToast('error', errorData.message || 'Validation failed. Please correct the fields below.');
      } else if (status === 401 || status === 403) {
        showToast('error', errorData?.message || 'Unauthorized: Only administrators can create staff accounts.');
      } else if (status === 409) {
        const msg = errorData?.message || 'A conflicting account already exists.';
        const lowerMsg = msg.toLowerCase();
        if (lowerMsg.includes('email')) {
          setFieldErrors((prev) => ({ ...prev, email: msg }));
        } else if (lowerMsg.includes('nic')) {
          setFieldErrors((prev) => ({ ...prev, nic: msg }));
        } else if (lowerMsg.includes('university staff id') || lowerMsg.includes('staff id')) {
          setFieldErrors((prev) => ({ ...prev, university_staff_id: msg }));
        } else if (lowerMsg.includes('license')) {
          setFieldErrors((prev) => ({ ...prev, license_number: msg }));
        }
        showToast('error', msg);
      } else if (status === 429) {
        showToast('error', errorData?.message || 'Too many provisioning attempts. Rate limit exceeded, please wait.');
      } else {
        showToast('error', errorData?.message || 'Failed to create staff account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Edit action
  const handleOpenEdit = async (user: UserItem) => {
    setLoadingList(true);
    try {
      const response = await api.get(`/admin/users/${user.id}`);
      if (response.data && response.data.success) {
        const u = response.data.data.user;
        setEditingUser(u);
        setEditName(u.name || '');
        setEditEmail(u.email || '');
        setEditNic(u.nic || '');
        setEditStaffId(u.medicalCenterStaff?.university_staff_id || u.ambulanceDriver?.university_staff_id || '');
        setEditLicense(u.medicalCenterStaff?.license_number || '');
        setEditSpecialization(u.medicalCenterStaff?.doctor?.specialization || '');
        setEditVehicle(u.ambulanceDriver?.vehicle_registration || '');
      }
    } catch {
      showToast('error', 'Failed to retrieve user details.');
    } finally {
      setLoadingList(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSavingEdit(true);
    const payload: Record<string, any> = {
      name: editName,
      email: editEmail,
      nic: editNic,
    };

    const isMedical = (MEDICAL_ROLES as readonly string[]).includes(editingUser.role);
    const isDriver = editingUser.role === 'AMBULANCE_DRIVER';

    if (isMedical || isDriver) payload.university_staff_id = editStaffId;
    if (isMedical) payload.license_number = editLicense;
    if (editingUser.role === 'DOCTOR') payload.specialization = editSpecialization;
    if (isDriver) payload.vehicle_registration = editVehicle;

    try {
      const response = await api.patch(`/admin/users/${editingUser.id}`, payload);
      showToast('success', response.data.message || 'Staff member details updated!');
      setEditingUser(null);
      fetchDirectory();
    } catch (err: any) {
      showToast('error', err.response?.data?.message || 'Failed to update user.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete action
  const handleDeleteUser = async (id: string) => {
    if (
      !window.confirm(
        'Are you absolutely sure you want to permanently delete and anonymize this staff member account? This action is irreversible.'
      )
    ) {
      return;
    }

    try {
      const response = await api.delete(`/admin/users/${id}`);
      showToast('success', response.data.message || 'Staff member successfully deleted.');
      fetchDirectory();
    } catch (err: any) {
      showToast('error', err.response?.data?.message || 'Failed to delete staff member.');
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const isMedicalRole = (MEDICAL_ROLES as readonly string[]).includes(role);
  const isDriverRole = role === 'AMBULANCE_DRIVER';

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex font-sans">
      {/* Admin Sidebar Navigation */}
      <aside className="w-64 bg-[#111827] border-r border-slate-800 hidden md:flex flex-col p-6 shrink-0">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-emerald-500 rounded-lg text-white">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-white tracking-wide text-sm">MedCenter Admin</h2>
            <p className="text-xs text-slate-500">Enterprise Control</p>
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          <button
            onClick={() => setActiveTab('provision')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'provision'
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <UserPlus className="w-5 h-5" />
            <span>Create Staff Account</span>
          </button>

          <button
            onClick={() => setActiveTab('directory')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'directory'
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Staff Directory</span>
          </button>
        </nav>

        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={() => {
              localStorage.removeItem('session_token');
              document.cookie = 'session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              window.location.href = '/login';
            }}
            className="w-full text-left px-4 py-3 rounded-xl hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 text-sm font-semibold transition-all flex items-center gap-3"
          >
            <Key className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 p-6 md:p-12 overflow-y-auto relative z-10 max-w-5xl mx-auto w-full">
        {/* Floating Toast Notification */}
        {toast && (
          <div
            className={`fixed top-6 right-6 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 border transition-all duration-300 max-w-md ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/50'
                : 'bg-rose-950/90 border-rose-500/40 text-rose-200 shadow-rose-950/50'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        )}

        {/* Create Staff Account Tab View (Flow A) */}
        {activeTab === 'provision' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Create Staff Account</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Direct credential provisioning for doctors, nurses, pharmacists, drivers, and administrators.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('directory')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-2 self-start"
              >
                <Users className="w-4 h-4 text-emerald-400" />
                <span>View Staff Directory</span>
              </button>
            </div>

            {/* Flow A Security Notice */}
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 flex items-start gap-3.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-emerald-300">Direct Credential Flow (Active)</p>
                <p className="text-slate-400 leading-relaxed">
                  The account is verified immediately upon creation with the password provided below. Please share the credentials
                  securely with the staff member.
                </p>
              </div>
            </div>

            {/* Create Staff Form Card */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl">
              <form onSubmit={handleProvisionSubmit} className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-3 uppercase tracking-wider">
                    1. Primary Information
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Name */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Full Name <span className="text-rose-450">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <User className="w-5 h-5" />
                      </span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: '' }));
                        }}
                        placeholder="Dr. Dilisha Madushan"
                        className={`w-full pl-11 pr-4 py-3 bg-[#0b0f19] border rounded-xl focus:outline-none focus:ring-1 text-xs text-white transition-colors ${
                          fieldErrors.name
                            ? 'border-rose-500/60 focus:ring-rose-500'
                            : 'border-slate-800 focus:border-emerald-500 focus:ring-emerald-500'
                        }`}
                      />
                    </div>
                    {fieldErrors.name && (
                      <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{fieldErrors.name}</span>
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Email Address <span className="text-rose-450">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-5 h-5" />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
                        }}
                        placeholder="dilisha@medcenter.lk"
                        className={`w-full pl-11 pr-4 py-3 bg-[#0b0f19] border rounded-xl focus:outline-none focus:ring-1 text-xs text-white transition-colors ${
                          fieldErrors.email
                            ? 'border-rose-500/60 focus:ring-rose-500'
                            : 'border-slate-800 focus:border-emerald-500 focus:ring-emerald-500'
                        }`}
                      />
                    </div>
                    {fieldErrors.email && (
                      <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{fieldErrors.email}</span>
                      </p>
                    )}
                  </div>

                  {/* NIC */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      NIC / National ID <span className="text-rose-450">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <IdCard className="w-5 h-5" />
                      </span>
                      <input
                        type="text"
                        value={nic}
                        onChange={(e) => {
                          setNic(e.target.value);
                          if (fieldErrors.nic) setFieldErrors((prev) => ({ ...prev, nic: '' }));
                        }}
                        placeholder="199912345678 or 991234567V"
                        className={`w-full pl-11 pr-4 py-3 bg-[#0b0f19] border rounded-xl focus:outline-none focus:ring-1 text-xs text-white transition-colors ${
                          fieldErrors.nic
                            ? 'border-rose-500/60 focus:ring-rose-500'
                            : 'border-slate-800 focus:border-emerald-500 focus:ring-emerald-500'
                        }`}
                      />
                    </div>
                    {fieldErrors.nic && (
                      <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{fieldErrors.nic}</span>
                      </p>
                    )}
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Role Classification <span className="text-rose-450">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Briefcase className="w-5 h-5" />
                      </span>
                      <select
                        value={role}
                        onChange={handleRoleChange}
                        className="w-full pl-11 pr-4 py-3 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-slate-200 appearance-none transition-colors"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {fieldErrors.role && (
                      <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{fieldErrors.role}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Credentials & Password Setup */}
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                      2. Initial Credentials &amp; Password
                    </h3>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all self-start sm:self-auto"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Strong Password</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Password */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Password <span className="text-rose-450">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Lock className="w-5 h-5" />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        autoComplete="new-password"
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
                        }}
                        placeholder="At least 8 characters"
                        className={`w-full pl-11 pr-11 py-3 bg-[#0b0f19] border rounded-xl focus:outline-none focus:ring-1 text-xs text-white transition-colors ${
                          fieldErrors.password
                            ? 'border-rose-500/60 focus:ring-rose-500'
                            : 'border-slate-800 focus:border-emerald-500 focus:ring-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{fieldErrors.password}</span>
                      </p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Confirm Password <span className="text-rose-450">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Lock className="w-5 h-5" />
                      </span>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        autoComplete="new-password"
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
                        }}
                        placeholder="Re-enter password"
                        className={`w-full pl-11 pr-11 py-3 bg-[#0b0f19] border rounded-xl focus:outline-none focus:ring-1 text-xs text-white transition-colors ${
                          fieldErrors.confirmPassword
                            ? 'border-rose-500/60 focus:ring-rose-500'
                            : 'border-slate-800 focus:border-emerald-500 focus:ring-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldErrors.confirmPassword && (
                      <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{fieldErrors.confirmPassword}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Conditional Role Credentials */}
                {(isMedicalRole || isDriverRole) && (
                  <div className="space-y-6 pt-4 border-t border-slate-800">
                    <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-3 uppercase tracking-wider">
                      3. Role-Specific Credentials
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* University Staff ID (Doctors, Nurses, Pharmacists, Drivers) */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                          University Staff ID <span className="text-rose-450">*</span>
                        </label>
                        <input
                          type="text"
                          value={universityStaffId}
                          onChange={(e) => {
                            setUniversityStaffId(e.target.value);
                            if (fieldErrors.university_staff_id)
                              setFieldErrors((prev) => ({ ...prev, university_staff_id: '' }));
                          }}
                          placeholder="UMC/STAFF/404"
                          className={`w-full px-4 py-3 bg-[#0b0f19] border rounded-xl focus:outline-none focus:ring-1 text-xs text-white transition-colors ${
                            fieldErrors.university_staff_id
                              ? 'border-rose-500/60 focus:ring-rose-500'
                              : 'border-slate-800 focus:border-emerald-500 focus:ring-emerald-500'
                          }`}
                        />
                        {fieldErrors.university_staff_id && (
                          <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{fieldErrors.university_staff_id}</span>
                          </p>
                        )}
                      </div>

                      {/* License Number (Doctors, Nurses, Pharmacists) */}
                      {isMedicalRole && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            License Registration Number <span className="text-rose-450">*</span>
                          </label>
                          <input
                            type="text"
                            value={licenseNumber}
                            onChange={(e) => {
                              setLicenseNumber(e.target.value);
                              if (fieldErrors.license_number)
                                setFieldErrors((prev) => ({ ...prev, license_number: '' }));
                            }}
                            placeholder="SLMC-R-12345"
                            className={`w-full px-4 py-3 bg-[#0b0f19] border rounded-xl focus:outline-none focus:ring-1 text-xs text-white transition-colors ${
                              fieldErrors.license_number
                                ? 'border-rose-500/60 focus:ring-rose-500'
                                : 'border-slate-800 focus:border-emerald-500 focus:ring-emerald-500'
                            }`}
                          />
                          {fieldErrors.license_number && (
                            <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{fieldErrors.license_number}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {/* Specialization (Doctors Only) */}
                      {role === 'DOCTOR' && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Area of Specialization <span className="text-rose-450">*</span>
                          </label>
                          <input
                            type="text"
                            value={specialization}
                            onChange={(e) => {
                              setSpecialization(e.target.value);
                              if (fieldErrors.specialization)
                                setFieldErrors((prev) => ({ ...prev, specialization: '' }));
                            }}
                            placeholder="General Medicine, Cardiology, etc."
                            className={`w-full px-4 py-3 bg-[#0b0f19] border rounded-xl focus:outline-none focus:ring-1 text-xs text-white transition-colors ${
                              fieldErrors.specialization
                                ? 'border-rose-500/60 focus:ring-rose-500'
                                : 'border-slate-800 focus:border-emerald-500 focus:ring-emerald-500'
                            }`}
                          />
                          {fieldErrors.specialization && (
                            <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{fieldErrors.specialization}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {/* Vehicle Registration (Ambulance Drivers Only) */}
                      {role === 'AMBULANCE_DRIVER' && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Vehicle Plate Number <span className="text-rose-450">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                              <Truck className="w-5 h-5" />
                            </span>
                            <input
                              type="text"
                              value={vehicleRegistration}
                              onChange={(e) => {
                                setVehicleRegistration(e.target.value);
                                if (fieldErrors.vehicle_registration)
                                  setFieldErrors((prev) => ({ ...prev, vehicle_registration: '' }));
                              }}
                              placeholder="WP WP-7744"
                              className={`w-full pl-11 pr-4 py-3 bg-[#0b0f19] border rounded-xl focus:outline-none focus:ring-1 text-xs text-white transition-colors ${
                                fieldErrors.vehicle_registration
                                  ? 'border-rose-500/60 focus:ring-rose-500'
                                  : 'border-slate-800 focus:border-emerald-500 focus:ring-emerald-500'
                              }`}
                            />
                          </div>
                          {fieldErrors.vehicle_registration && (
                            <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{fieldErrors.vehicle_registration}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Form Action Controls */}
                <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-[11px] text-slate-500">
                    Fields marked with <span className="text-rose-450 font-bold">*</span> are required.
                  </p>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-950/20"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating Staff Account...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Create &amp; Verify Account</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Directory Tab View */}
        {activeTab === 'directory' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Staff User Directory</h1>
                <p className="text-xs text-slate-400 mt-1">Manage, update credentials, or decommission accounts.</p>
              </div>

              <button
                onClick={() => setActiveTab('provision')}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/20"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create Staff Member</span>
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4">
              <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2 w-full">
                <input
                  type="text"
                  placeholder="Search by name, email, NIC..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 px-4 py-2 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
                >
                  Search
                </button>
              </form>

              <div className="flex gap-2 w-full md:w-auto shrink-0">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3.5 py-2 bg-[#0b0f19] border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full md:w-40"
                >
                  <option value="">All Roles</option>
                  <option value="DOCTOR">Doctors</option>
                  <option value="NURSE">Nurses</option>
                  <option value="PHARMACIST">Pharmacists</option>
                  <option value="AMBULANCE_DRIVER">Drivers</option>
                  <option value="ADMIN">Administrators</option>
                </select>

                <button
                  onClick={fetchDirectory}
                  className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors text-slate-400 hover:text-white"
                  title="Reload"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List Table Container */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              {loadingList ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                  <span className="text-xs">Loading directory records...</span>
                </div>
              ) : users.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#151c2c] border-b border-slate-800 text-[10px] text-slate-400 uppercase font-black tracking-widest">
                        <th className="py-4 px-6">Name</th>
                        <th className="py-4 px-6">Email</th>
                        <th className="py-4 px-6">Role</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-900/20 transition-colors">
                          <td className="py-4 px-6 font-bold text-white">{u.name}</td>
                          <td className="py-4 px-6 text-slate-400 font-mono">{u.email}</td>
                          <td className="py-4 px-6">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                u.role === 'ADMIN'
                                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                  : u.role === 'DOCTOR'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : u.role === 'NURSE'
                                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                  : u.role === 'PHARMACIST'
                                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                u.status === 'VERIFIED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : u.status === 'UNVERIFIED'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right space-x-2.5">
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 font-bold"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-rose-400 hover:text-rose-350 transition-colors inline-flex items-center gap-1 font-bold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-500 text-xs flex flex-col items-center gap-2">
                  <Users className="w-8 h-8 text-slate-700" />
                  <span>No staff records found matching filters.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit Modal Backdrop */}
        {editingUser && (
          <div className="fixed inset-0 z-50 bg-[#090d16]/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-[#111827] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-[#151c2c] border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Edit Staff Credentials</h3>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block uppercase mb-1">
                    Account Role Classification
                  </span>
                  <span className="px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-mono font-bold inline-block">
                    {editingUser.role}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Full Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Email Address</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">NIC / National ID</label>
                    <input
                      type="text"
                      value={editNic}
                      onChange={(e) => setEditNic(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                      required
                    />
                  </div>
                </div>

                {/* Conditional fields edit panel */}
                {((MEDICAL_ROLES as readonly string[]).includes(editingUser.role) ||
                  editingUser.role === 'AMBULANCE_DRIVER') && (
                  <div className="pt-4 border-t border-slate-800 space-y-6">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Role Credentials</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">
                          University Staff ID
                        </label>
                        <input
                          type="text"
                          value={editStaffId}
                          onChange={(e) => setEditStaffId(e.target.value)}
                          className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                          required
                        />
                      </div>

                      {(MEDICAL_ROLES as readonly string[]).includes(editingUser.role) && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">
                            License Number
                          </label>
                          <input
                            type="text"
                            value={editLicense}
                            onChange={(e) => setEditLicense(e.target.value)}
                            className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                            required
                          />
                        </div>
                      )}

                      {editingUser.role === 'DOCTOR' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">
                            Specialization
                          </label>
                          <input
                            type="text"
                            value={editSpecialization}
                            onChange={(e) => setEditSpecialization(e.target.value)}
                            className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                            required
                          />
                        </div>
                      )}

                      {editingUser.role === 'AMBULANCE_DRIVER' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">
                            Ambulance Vehicle Plate Number
                          </label>
                          <input
                            type="text"
                            value={editVehicle}
                            onChange={(e) => setEditVehicle(e.target.value)}
                            className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                            required
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Footer Modal Actions */}
                <div className="pt-4 border-t border-slate-800 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/20"
                  >
                    {savingEdit ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
