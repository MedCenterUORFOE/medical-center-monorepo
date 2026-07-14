'use client';

import React, { useState, useEffect } from 'react';
import { UserPlus, Mail, User, Shield, Briefcase, Key, IdCard, Truck, CheckCircle2, AlertTriangle, Loader2, Users, Edit3, Trash2, X, RefreshCw } from 'lucide-react';
import api from '@/lib/axios';

const ROLES = [
  { value: 'DOCTOR', label: 'Doctor' },
  { value: 'NURSE', label: 'Nurse' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'AMBULANCE_DRIVER', label: 'Ambulance Driver' },
  { value: 'ADMIN', label: 'System Administrator' }
];

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'directory' | 'provision'>('directory');

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
  const [role, setRole] = useState('DOCTOR');
  const [universityStaffId, setUniversityStaffId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [vehicleRegistration, setVehicleRegistration] = useState('');

  // UI Status
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  // Fetch staff directory
  const fetchDirectory = async () => {
    setLoadingList(true);
    try {
      const response = await api.get('/admin/users', {
        params: {
          search: searchTerm || undefined,
          role: roleFilter || undefined,
          limit: 100
        }
      });
      if (response.data && response.data.success) {
        // Filter out student users from directory - only show staff roles
        const staff = (response.data.data.users || []).filter((u: any) => u.role !== 'STUDENT');
        setUsers(staff);
      }
    } catch (err: any) {
      console.error('Error fetching directory:', err);
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
    setRole(e.target.value);
    setUniversityStaffId('');
    setLicenseNumber('');
    setSpecialization('');
    setVehicleRegistration('');
  };

  // Provision new user
  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setToast(null);

    const payload: Record<string, any> = { name, email, nic, role };
    const isMedical = ['DOCTOR', 'NURSE', 'PHARMACIST'].includes(role);
    const isDriver = role === 'AMBULANCE_DRIVER';

    if (isMedical || isDriver) payload.university_staff_id = universityStaffId;
    if (isMedical) payload.license_number = licenseNumber;
    if (role === 'DOCTOR') payload.specialization = specialization;
    if (isDriver) payload.vehicle_registration = vehicleRegistration;

    try {
      const response = await api.post('/admin/users', payload);
      showToast('success', response.data.message || 'Staff member provisioned successfully!');
      
      // Reset form
      setName('');
      setEmail('');
      setNic('');
      setUniversityStaffId('');
      setLicenseNumber('');
      setSpecialization('');
      setVehicleRegistration('');
      
      // Auto switch back to directory
      setActiveTab('directory');
    } catch (err: any) {
      console.error('Provisioning error:', err);
      let errMsg = 'Failed to provision staff member.';
      if (err.response && err.response.data) {
        errMsg = err.response.data.message || err.response.data.error || errMsg;
        if (err.response.data.errors && Array.isArray(err.response.data.errors)) {
          errMsg = err.response.data.errors.map((d: any) => d.message).join(', ');
        }
      }
      showToast('error', errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Edit action
  const handleOpenEdit = async (user: UserItem) => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/users/${user.id}`);
      if (response.data && response.data.success) {
        const u = response.data.data.user;
        setEditingUser(u);
        setEditName(u.name || '');
        setEditEmail(u.email || '');
        setEditNic(u.nic || '');
        
        // Conditional role fields
        setEditStaffId(u.medicalCenterStaff?.university_staff_id || u.ambulanceDriver?.university_staff_id || '');
        setEditLicense(u.medicalCenterStaff?.license_number || '');
        setEditSpecialization(u.medicalCenterStaff?.doctor?.specialization || '');
        setEditVehicle(u.ambulanceDriver?.vehicle_registration || '');
      }
    } catch (err) {
      console.error('Edit fetch error:', err);
      showToast('error', 'Failed to retrieve user details.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSavingEdit(true);
    const payload: Record<string, any> = {
      name: editName,
      email: editEmail,
      nic: editNic
    };

    const isMedical = ['DOCTOR', 'NURSE', 'PHARMACIST'].includes(editingUser.role);
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
      console.error('Update error:', err);
      showToast('error', err.response?.data?.message || 'Failed to update user.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete action
  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Are you absolutely sure you want to permanently delete and anonymize this staff member account? This action is irreversible.')) {
      return;
    }

    try {
      const response = await api.delete(`/admin/users/${id}`);
      showToast('success', response.data.message || 'Staff member successfully deleted.');
      fetchDirectory();
    } catch (err: any) {
      console.error('Deletion error:', err);
      showToast('error', err.response?.data?.message || 'Failed to delete staff member.');
    }
  };

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

          <button
            onClick={() => setActiveTab('provision')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'provision'
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <UserPlus className="w-5 h-5" />
            <span>Provision Staff</span>
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
      <main className="flex-1 p-6 md:p-12 overflow-y-auto relative z-10 max-w-6xl mx-auto w-full">
        {/* Floating Toast Notification */}
        {toast && (
          <div
            className={`fixed top-6 right-6 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 border transition-all duration-300 transform translate-y-0 ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
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

        {/* Directory Tab View */}
        {activeTab === 'directory' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Staff User Directory</h1>
                <p className="text-xs text-slate-500 mt-1">Manage, update credentials, or decommission accounts.</p>
              </div>
              
              <button
                onClick={() => setActiveTab('provision')}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/20"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Staff Member</span>
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
                  className="flex-1 px-4 py-2 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-xl text-xs font-semibold border border-slate-750 transition-colors"
                >
                  Search
                </button>
              </form>

              <div className="flex gap-2 w-full md:w-auto shrink-0">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3.5 py-2 bg-[#0b0f19] border border-slate-850 rounded-xl text-xs text-slate-350 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full md:w-40"
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
                  className="p-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl transition-colors text-slate-400 hover:text-white"
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
                      <tr className="bg-[#151c2c] border-b border-slate-800 text-[10px] text-slate-450 uppercase font-black tracking-widest">
                        <th className="py-4 px-6">Name</th>
                        <th className="py-4 px-6">Email</th>
                        <th className="py-4 px-6">Role</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/60 text-xs">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-900/20 transition-colors">
                          <td className="py-4 px-6 font-bold text-white">{u.name}</td>
                          <td className="py-4 px-6 text-slate-400 font-mono">{u.email}</td>
                          <td className="py-4 px-6">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.role === 'ADMIN' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                              u.role === 'DOCTOR' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              u.role === 'NURSE' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                              u.role === 'PHARMACIST' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              u.status === 'UNVERIFIED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                            }`}>
                              {u.status}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right space-x-2.5">
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="text-emerald-450 hover:text-emerald-350 transition-colors inline-flex items-center gap-1 font-bold"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-rose-450 hover:text-rose-350 transition-colors inline-flex items-center gap-1 font-bold"
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
                  <Users className="w-8 h-8 text-slate-800" />
                  <span>No staff records found matching filters.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Provision Tab View */}
        {activeTab === 'provision' && (
          <div>
            <div className="mb-8">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Provision New Staff</h1>
              <p className="text-xs text-slate-500 mt-1">
                Create internal medical center roles. Staff can access activation via verification tokens.
              </p>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl">
              <form onSubmit={handleProvisionSubmit} className="space-y-6">
                <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-3 uppercase tracking-wider">Primary Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <User className="w-5 h-5" />
                      </span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Dr. Dilisha Madushan"
                        className="w-full pl-11 pr-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-5 h-5" />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="dilisha@medcenter.lk"
                        className="w-full pl-11 pr-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">NIC / National ID</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <IdCard className="w-5 h-5" />
                      </span>
                      <input
                        type="text"
                        value={nic}
                        onChange={(e) => setNic(e.target.value)}
                        placeholder="991234567V"
                        className="w-full pl-11 pr-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Role Classification</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Briefcase className="w-5 h-5" />
                      </span>
                      <select
                        value={role}
                        onChange={handleRoleChange}
                        className="w-full pl-11 pr-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-slate-350 appearance-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Conditional Fields block */}
                {(['DOCTOR', 'NURSE', 'PHARMACIST'].includes(role) || role === 'AMBULANCE_DRIVER') && (
                  <div className="space-y-6 pt-4 border-t border-slate-850">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Role Credentials</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">University Staff ID</label>
                        <input
                          type="text"
                          value={universityStaffId}
                          onChange={(e) => setUniversityStaffId(e.target.value)}
                          placeholder="UMC/STAFF/404"
                          className="w-full px-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                          required
                        />
                      </div>

                      {['DOCTOR', 'NURSE', 'PHARMACIST'].includes(role) && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">License Registration Number</label>
                          <input
                            type="text"
                            value={licenseNumber}
                            onChange={(e) => setLicenseNumber(e.target.value)}
                            placeholder="SLMC-R-12345"
                            className="w-full px-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                            required
                          />
                        </div>
                      )}

                      {role === 'DOCTOR' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Area of Specialization</label>
                          <input
                            type="text"
                            value={specialization}
                            onChange={(e) => setSpecialization(e.target.value)}
                            placeholder="General Medicine, Cardiology..."
                            className="w-full px-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                            required
                          />
                        </div>
                      )}

                      {role === 'AMBULANCE_DRIVER' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Vehicle Plate Number</label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                              <Truck className="w-5 h-5" />
                            </span>
                            <input
                              type="text"
                              value={vehicleRegistration}
                              onChange={(e) => setVehicleRegistration(e.target.value)}
                              placeholder="WP WP-7744"
                              className="w-full pl-11 pr-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                              required
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-850 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold rounded-xl transition-all duration-200 flex items-center gap-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-950/20"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Provisioning Account...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Create & Provision</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
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
                  className="text-slate-450 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block uppercase mb-1">Account Role Classification</span>
                  <span className="px-3 py-1 bg-slate-850 border border-slate-800 text-slate-300 rounded-lg text-xs font-mono font-bold inline-block">
                    {editingUser.role}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-2">Full Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-2">Email Address</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-2">NIC / National ID</label>
                    <input
                      type="text"
                      value={editNic}
                      onChange={(e) => setEditNic(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                      required
                    />
                  </div>
                </div>

                {/* Conditional fields edit panel */}
                {(['DOCTOR', 'NURSE', 'PHARMACIST'].includes(editingUser.role) || editingUser.role === 'AMBULANCE_DRIVER') && (
                  <div className="pt-4 border-t border-slate-850 space-y-6">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Role Credentials</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-450 uppercase mb-2">University Staff ID</label>
                        <input
                          type="text"
                          value={editStaffId}
                          onChange={(e) => setEditStaffId(e.target.value)}
                          className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                          required
                        />
                      </div>

                      {['DOCTOR', 'NURSE', 'PHARMACIST'].includes(editingUser.role) && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-450 uppercase mb-2">SLMC License Number</label>
                          <input
                            type="text"
                            value={editLicense}
                            onChange={(e) => setEditLicense(e.target.value)}
                            className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                            required
                          />
                        </div>
                      )}

                      {editingUser.role === 'DOCTOR' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-450 uppercase mb-2">Specialization</label>
                          <input
                            type="text"
                            value={editSpecialization}
                            onChange={(e) => setEditSpecialization(e.target.value)}
                            className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                            required
                          />
                        </div>
                      )}

                      {editingUser.role === 'AMBULANCE_DRIVER' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-450 uppercase mb-2">Ambulance Vehicle Plate Number</label>
                          <input
                            type="text"
                            value={editVehicle}
                            onChange={(e) => setEditVehicle(e.target.value)}
                            className="w-full px-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                            required
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Footer Modal Actions */}
                <div className="pt-4 border-t border-slate-850 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-xl text-xs font-semibold border border-slate-750 transition-colors"
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
