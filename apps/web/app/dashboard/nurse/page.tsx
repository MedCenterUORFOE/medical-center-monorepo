'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, Calendar, Activity, Weight, FileText, PlusCircle, Save, Edit3, Loader2, CheckCircle2, AlertTriangle, ShieldAlert, Key, Pill } from 'lucide-react';
import api from '@/lib/axios';

interface Patient {
  id: string;
  name: string;
  email: string;
  nic: string;
  role: string;
  student?: {
    university_reg_number: string;
    faculty: string;
  } | null;
  academicStaff?: {
    university_staff_id: string;
    department: string;
  } | null;
  patientProfile?: {
    blood_group: string | null;
    allergies: string | null;
    special_notes: string | null;
    height: number | null;
    weight: number | null;
    date_of_birth: string | null;
  } | null;
}

export default function NurseDashboard() {
  const router = useRouter();

  // Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selected Patient State
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Profile Form States
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [bloodGroup, setBloodGroup] = useState('A+');
  const [allergies, setAllergies] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  // Form Editing Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Feedback states
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  // Debounced search logic for patient typeahead
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const response = await api.get(`/clinical/patients?q=${encodeURIComponent(searchQuery)}`);
        if (response.data && response.data.data) {
          setSearchResults(response.data.data.patients || []);
        }
      } catch (err: any) {
        console.error('Search error:', err);
        setSearchError(err.response?.data?.error || 'Failed to search patients');
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Load detailed patient profile when selected
  const handleSelectPatient = async (patientId: string) => {
    setSelectedPatientId(patientId);
    setLoadingProfile(true);
    setToast(null);
    setIsEditMode(false);
    
    // Clear form states
    setDateOfBirth('');
    setBloodGroup('A+');
    setAllergies('');
    setHeight('');
    setWeight('');
    setSpecialNotes('');

    try {
      const response = await api.get(`/profiles/${patientId}`);
      if (response.data && response.data.data) {
        const patientData = response.data.data.patient as Patient;
        setSelectedPatient(patientData);

        if (patientData.patientProfile) {
          const profile = patientData.patientProfile;
          // Prefill existing profile values
          setDateOfBirth(profile.date_of_birth ? profile.date_of_birth.split('T')[0] : '');
          setBloodGroup(profile.blood_group || 'A+');
          setAllergies(profile.allergies || '');
          setHeight(profile.height ? String(profile.height) : '');
          setWeight(profile.weight ? String(profile.weight) : '');
          setSpecialNotes(profile.special_notes || '');
          setIsEditMode(false); // In view mode for existing profiles
        } else {
          // No profile exists, switch directly to creation mode
          setIsEditMode(true);
        }
      }
    } catch (err: any) {
      console.error('Profile load error:', err);
      showToast('error', err.response?.data?.error || 'Failed to retrieve patient profile.');
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;

    setSubmitting(true);
    setToast(null);

    // Client-side validations
    const floatHeight = parseFloat(height);
    const floatWeight = parseFloat(weight);

    if (isNaN(floatHeight) || floatHeight <= 0) {
      showToast('error', 'Height must be a positive number (in cm or meters)');
      setSubmitting(false);
      return;
    }

    if (isNaN(floatWeight) || floatWeight <= 0) {
      showToast('error', 'Weight must be a positive number (in kg)');
      setSubmitting(false);
      return;
    }

    if (dateOfBirth) {
      const selectedDate = new Date(dateOfBirth);
      const today = new Date();
      if (selectedDate > today) {
        showToast('error', 'Date of Birth cannot be a future date.');
        setSubmitting(false);
        return;
      }
    }

    const payload = {
      blood_group: bloodGroup,
      allergies: allergies.trim(),
      special_notes: specialNotes.trim(),
      height: floatHeight,
      weight: floatWeight,
      date_of_birth: dateOfBirth ? new Date(dateOfBirth).toISOString() : null
    };

    try {
      // Upsert profile via PUT
      const response = await api.put(`/profiles/${selectedPatientId}`, payload);
      
      showToast('success', response.data.message || 'Patient profile successfully saved!');
      
      // Reload profile view
      handleSelectPatient(selectedPatientId);
    } catch (err: any) {
      console.error('Form submission error:', err);
      showToast('error', err.response?.data?.error || 'Failed to submit patient profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const getPatientDisplayId = (patient: Patient) => {
    if (patient.role === 'STUDENT' && patient.student) {
      return patient.student.university_reg_number;
    }
    if (patient.role === 'ACADEMIC_STAFF' && patient.academicStaff) {
      return patient.academicStaff.university_staff_id;
    }
    return patient.nic;
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="bg-[#111827] border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500 rounded-lg text-white">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-extrabold text-white text-lg tracking-wide">University Medical Center</h1>
            <p className="text-xs text-slate-500">Nurse Clinical Station</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/pharmacist')}
            className="px-4 py-2 hover:bg-emerald-500/10 text-emerald-400 hover:text-emerald-350 text-xs font-bold rounded-lg border border-transparent hover:border-emerald-500/20 transition-all flex items-center gap-2"
          >
            <Pill className="w-4 h-4" />
            <span>Pharmacy Station</span>
          </button>
          
          <button
            onClick={() => {
              localStorage.removeItem('session_token');
              document.cookie = 'session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              router.push('/login');
            }}
            className="px-4 py-2 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 text-xs font-bold rounded-lg border border-transparent hover:border-rose-500/20 transition-all flex items-center gap-2"
          >
            <Key className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side Pane: Patient Search */}
        <aside className="w-80 border-r border-slate-800 bg-[#0f1422] p-5 flex flex-col gap-5 shrink-0 overflow-y-auto">
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Search Patient</h3>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="NIC, Name, Reg Number..."
                className="w-full pl-9 pr-4 py-2.5 bg-[#0b0f19] border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 transition-all text-xs text-white"
              />
            </div>
            {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
              <span className="text-[10px] text-slate-500 mt-1 block">Enter at least 2 characters</span>
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Search Results</h4>
            
            {searching ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                <span className="text-xs">Searching records...</span>
              </div>
            ) : searchError ? (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{searchError}</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                {searchResults.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => handleSelectPatient(patient.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${
                      selectedPatientId === patient.id
                        ? 'bg-slate-800/80 border-emerald-500/40 shadow-md shadow-emerald-950/10'
                        : 'bg-[#151b2c] hover:bg-slate-800/40 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-xs text-white truncate max-w-[160px]">{patient.name}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#0b0f19] text-slate-500">
                        {patient.role.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[10px] text-slate-500">
                      <span>ID: {getPatientDisplayId(patient)}</span>
                      <span>NIC: {patient.nic}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : searchQuery.trim().length >= 2 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No patients match "{searchQuery}"
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
                <User className="w-6 h-6 text-slate-600" />
                <span>Type in lookup parameters to load a patient record.</span>
              </div>
            )}
          </div>
        </aside>

        {/* Right Side Pane: Detailed View / Form Editor */}
        <main className="flex-1 bg-[#0b0f19] p-6 md:p-8 flex flex-col overflow-y-auto relative">
          {/* Floating Toast */}
          {toast && (
            <div
              className={`fixed top-20 right-6 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 border transition-all duration-300 transform translate-y-0 ${
                toast.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span className="text-xs font-semibold">{toast.message}</span>
            </div>
          )}

          {loadingProfile ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
              <span className="text-sm">Fetching baseline clinical profile...</span>
            </div>
          ) : selectedPatient ? (
            <div className="max-w-3xl w-full mx-auto space-y-6">
              {/* Patient Basic Detail Card */}
              <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 shadow-xl flex items-start gap-4 justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[120px] h-[120px] rounded-full bg-[#10b981]/5 blur-[25px] pointer-events-none" />
                
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-400 shrink-0 border border-slate-700">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white leading-tight">{selectedPatient.name}</h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-400">
                      <span className="font-semibold text-emerald-400">{selectedPatient.role.replace('_', ' ')}</span>
                      <span className="text-slate-600">•</span>
                      <span>ID: {getPatientDisplayId(selectedPatient)}</span>
                      <span className="text-slate-600">•</span>
                      <span>NIC: {selectedPatient.nic}</span>
                    </div>
                  </div>
                </div>

                {!isEditMode && selectedPatient.patientProfile && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit Profile</span>
                  </button>
                )}
              </div>

              {/* Patient Clinical Profile Form */}
              <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl">
                <form onSubmit={handleFormSubmit} className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-slate-200">
                      {selectedPatient.patientProfile ? 'Clinical Information' : 'Initialize Clinical Profile'}
                    </h3>
                    {!selectedPatient.patientProfile && (
                      <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded uppercase">
                        Unregistered
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Date of Birth */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Date of Birth</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                          <Calendar className="w-4 h-4" />
                        </span>
                        <input
                          type="date"
                          value={dateOfBirth}
                          onChange={(e) => setDateOfBirth(e.target.value)}
                          disabled={!isEditMode}
                          className="w-full pl-9 pr-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all text-xs text-white disabled:opacity-60 disabled:cursor-not-allowed"
                          required
                        />
                      </div>
                    </div>

                    {/* Blood Group */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Blood Group</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                          <Activity className="w-4 h-4" />
                        </span>
                        <select
                          value={bloodGroup}
                          onChange={(e) => setBloodGroup(e.target.value)}
                          disabled={!isEditMode}
                          className="w-full pl-9 pr-4 py-2.5 bg-[#0b0f19] border border-slate-855 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all text-xs text-white appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                            <option key={bg} value={bg}>{bg}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Height */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Height (cm)</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                          <Activity className="w-4 h-4" />
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          placeholder="175.5"
                          disabled={!isEditMode}
                          className="w-full pl-9 pr-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 transition-all text-xs text-white disabled:opacity-60 disabled:cursor-not-allowed"
                          required
                        />
                      </div>
                    </div>

                    {/* Weight */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Weight (kg)</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                          <Weight className="w-4 h-4" />
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          placeholder="68.2"
                          disabled={!isEditMode}
                          className="w-full pl-9 pr-4 py-2.5 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 transition-all text-xs text-white disabled:opacity-60 disabled:cursor-not-allowed"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Allergies */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Known Allergies</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 pt-3.5 pointer-events-none text-slate-500">
                        <AlertTriangle className="w-4 h-4" />
                      </span>
                      <textarea
                        value={allergies}
                        onChange={(e) => setAllergies(e.target.value)}
                        placeholder="Penicillin, Peanuts, none, etc."
                        disabled={!isEditMode}
                        rows={2}
                        className="w-full pl-10 pr-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 transition-all text-xs text-white disabled:opacity-60 disabled:cursor-not-allowed resize-none"
                      />
                    </div>
                  </div>

                  {/* Special Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Special Medical Notes</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 pt-3.5 pointer-events-none text-slate-500">
                        <FileText className="w-4 h-4" />
                      </span>
                      <textarea
                        value={specialNotes}
                        onChange={(e) => setSpecialNotes(e.target.value)}
                        placeholder="Asthma history, diabetes details, cardiac tracking, etc."
                        disabled={!isEditMode}
                        rows={3}
                        className="w-full pl-10 pr-4 py-3 bg-[#0b0f19] border border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 transition-all text-xs text-white disabled:opacity-60 disabled:cursor-not-allowed resize-none"
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {isEditMode && (
                    <div className="flex gap-4 pt-4 border-t border-slate-800 justify-end">
                      {selectedPatient.patientProfile && (
                        <button
                          type="button"
                          onClick={() => handleSelectPatient(selectedPatientId!)}
                          disabled={submitting}
                          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold border border-slate-750 transition-all"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-xs shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Saving Profile...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            <span>Save Profile</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3 text-center max-w-sm mx-auto">
              <div className="p-4 bg-slate-800/40 border border-slate-800 text-emerald-400 rounded-2xl shrink-0">
                <Search className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-white mt-2">No Active Record Selected</h2>
              <p className="text-xs leading-relaxed">
                Use the search panel on the left to look up a patient by their Name, NIC, or University ID and select them to manage their profile.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
