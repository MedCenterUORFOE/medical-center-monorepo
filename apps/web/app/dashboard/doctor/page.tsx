'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, Calendar, Activity, Weight, FileText, PlusCircle, Save, Edit3, Loader2, CheckCircle2, AlertTriangle, ShieldAlert, Key, Plus, Trash2, Clock, History, AlertCircle } from 'lucide-react';
import api from '@/lib/axios';
import CertificateDrawer from './components/CertificateDrawer';

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

interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  scheduled_time: string;
  status: string;
  reason: string;
  patient: {
    user: {
      name: string;
      email: string;
      nic: string;
      role: string;
      student?: { university_reg_number: string } | null;
      academicStaff?: { university_staff_id: string } | null;
    }
  }
}

interface Medicine {
  id: string;
  name: string;
  category: string;
  unit: string;
  total_available_stock: number;
  display_string: string;
}

interface MedicalRecordItem {
  id: string;
  visit_date_time: string;
  symptoms: string;
  diagnosis: string;
  treatment_plan: string | null;
  prescription_notes: string | null;
  follow_up_date: string | null;
  notes: string | null;
  doctor_name: string;
  prescription?: {
    items: {
      id: string;
      medicine_id: string | null;
      external_medicine_name: string | null;
      dosage: string;
      quantity: number;
      instructions: string | null;
      source: 'INTERNAL' | 'EXTERNAL';
    }[]
  } | null;
}

interface PrescriptionFormItem {
  key: string;
  medicine_id: string | null;
  search_query: string;
  external_medicine_name: string | null;
  dosage: string;
  quantity: number;
  instructions: string;
  source: 'INTERNAL' | 'EXTERNAL';
  available_stock: number;
  unit: string;
  suggestions: Medicine[];
  show_dropdown: boolean;
}

export default function DoctorDashboard() {
  const router = useRouter();

  // Certificate Drawer State
  const [isCertDrawerOpen, setIsCertDrawerOpen] = useState(false);

  // Appointments Sidebar States
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  // Search Patient (Walk-in case) States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Selected Patient States
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [medicalHistory, setMedicalHistory] = useState<MedicalRecordItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form Fields
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [prescriptionNotes, setPrescriptionNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [notes, setNotes] = useState('');

  // Prescription Items
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionFormItem[]>([]);

  // Feedback states
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  // Fetch Scheduled Appointments on mount
  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    setLoadingAppointments(true);
    try {
      const response = await api.get('/appointments');
      if (response.data && response.data.success) {
        setAppointments(response.data.data || []);
      }
    } catch (err: any) {
      console.error('Error fetching appointments:', err);
    } finally {
      setLoadingAppointments(false);
    }
  };

  // Debounced search for walk-in patient lookup
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearchingPatient(true);
      try {
        const response = await api.get(`/clinical/patients?q=${encodeURIComponent(searchQuery)}`);
        if (response.data && response.data.data) {
          setSearchResults(response.data.data.patients || []);
          setShowSearchDropdown(true);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearchingPatient(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Load detailed patient profile and history timeline
  const handleSelectPatient = async (patientId: string, appointmentId?: string) => {
    setSelectedPatientId(patientId);
    setSelectedAppointmentId(appointmentId || null);
    setLoadingPatient(true);
    setLoadingHistory(true);
    setShowSearchDropdown(false);
    setSearchQuery('');
    setToast(null);

    // Reset Form fields
    setSymptoms('');
    setDiagnosis('');
    setTreatmentPlan('');
    setPrescriptionNotes('');
    setFollowUpDate('');
    setNotes('');
    setPrescriptionItems([]);

    // 1. Fetch Patient details
    try {
      const profilePromise = api.get(`/profiles/${patientId}`);
      const historyPromise = api.get(`/records/history/${patientId}`);

      const [profileRes, historyRes] = await Promise.all([profilePromise, historyPromise]);

      if (profileRes.data && profileRes.data.data) {
        setSelectedPatient(profileRes.data.data.patient);
      }

      if (historyRes.data && historyRes.data.data) {
        setMedicalHistory(historyRes.data.data.history || []);
      }
    } catch (err: any) {
      console.error('Error loading patient data:', err);
      showToast('error', err.response?.data?.error || 'Failed to retrieve patient medical profile.');
    } finally {
      setLoadingPatient(false);
      setLoadingHistory(false);
    }
  };

  // Live Medicine Catalog Lookup
  const handleMedicineSearch = async (index: number, query: string) => {
    const updated = [...prescriptionItems];
    updated[index].search_query = query;

    if (query.trim().length < 2) {
      updated[index].suggestions = [];
      updated[index].show_dropdown = false;
      setPrescriptionItems(updated);
      return;
    }

    try {
      const response = await api.get(`/medicines/catalog?search=${encodeURIComponent(query)}`);
      if (response.data && response.data.data) {
        updated[index].suggestions = response.data.data.catalog || [];
        updated[index].show_dropdown = updated[index].suggestions.length > 0;
        setPrescriptionItems(updated);
      }
    } catch (err) {
      console.error('Medicine search error:', err);
    }
  };

  // Select a medicine from catalog suggestion dropdown
  const handleSelectMedicine = (index: number, medicine: Medicine) => {
    const updated = [...prescriptionItems];
    updated[index].medicine_id = medicine.id;
    updated[index].search_query = medicine.name;
    updated[index].available_stock = medicine.total_available_stock;
    updated[index].unit = medicine.unit;
    updated[index].show_dropdown = false;
    updated[index].suggestions = [];

    // Automatically check stock quantity limits
    if (medicine.total_available_stock > 0) {
      updated[index].source = 'INTERNAL';
      updated[index].external_medicine_name = null;
    } else {
      updated[index].source = 'EXTERNAL';
      updated[index].external_medicine_name = medicine.name;
      updated[index].medicine_id = null;
    }

    setPrescriptionItems(updated);
  };

  // Validate Quantity input and toggle between internal and external dynamically
  const handleQuantityChange = (index: number, qty: number) => {
    const updated = [...prescriptionItems];
    updated[index].quantity = qty;

    if (updated[index].medicine_id) {
      // It is currently marked internal. Check if requested quantity exceeds available stock
      if (qty > updated[index].available_stock) {
        updated[index].source = 'EXTERNAL';
        updated[index].external_medicine_name = updated[index].search_query;
        // Don't wipe medicine_id completely so we know they searched it, but since it's external,
        // the API requires medicine_id to be null when source is EXTERNAL. We'll format it on submit.
      } else {
        updated[index].source = 'INTERNAL';
        updated[index].external_medicine_name = null;
      }
    }
    setPrescriptionItems(updated);
  };

  const handleAddPrescriptionItem = () => {
    setPrescriptionItems([
      ...prescriptionItems,
      {
        key: String(Date.now()) + Math.random(),
        medicine_id: null,
        search_query: '',
        external_medicine_name: null,
        dosage: '',
        quantity: 1,
        instructions: '',
        source: 'EXTERNAL',
        available_stock: 0,
        unit: 'Units',
        suggestions: [],
        show_dropdown: false,
      }
    ]);
  };

  const handleRemovePrescriptionItem = (index: number) => {
    const updated = [...prescriptionItems];
    updated.splice(index, 1);
    setPrescriptionItems(updated);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;

    setSubmitting(true);
    setToast(null);

    // Validate inputs
    if (!symptoms.trim() || !diagnosis.trim()) {
      showToast('error', 'Symptoms and Diagnosis are required.');
      setSubmitting(false);
      return;
    }

    // Format prescription items according to API schema
    const formattedItems = prescriptionItems.map((item) => {
      const isInternal = item.source === 'INTERNAL';
      return {
        medicine_id: isInternal ? item.medicine_id : null,
        external_medicine_name: isInternal ? null : (item.external_medicine_name || item.search_query),
        dosage: item.dosage.trim(),
        quantity: Number(item.quantity),
        instructions: item.instructions.trim(),
        source: item.source,
      };
    });

    // Subroutine to double check that items have required names
    for (const item of formattedItems) {
      if (item.source === 'INTERNAL' && !item.medicine_id) {
        showToast('error', 'Invalid selection. Please select an internal medicine from the suggestions.');
        setSubmitting(false);
        return;
      }
      if (item.source === 'EXTERNAL' && !item.external_medicine_name?.trim()) {
        showToast('error', 'Please input a name for the external medicine.');
        setSubmitting(false);
        return;
      }
      if (isNaN(item.quantity) || item.quantity <= 0) {
        showToast('error', 'Prescription quantities must be positive integers.');
        setSubmitting(false);
        return;
      }
    }

    const payload = {
      patient_id: selectedPatientId,
      appointment_id: selectedAppointmentId || undefined,
      symptoms: symptoms.trim(),
      diagnosis: diagnosis.trim(),
      treatment_plan: treatmentPlan.trim() || undefined,
      prescription_notes: prescriptionNotes.trim() || undefined,
      follow_up_date: followUpDate ? new Date(followUpDate).toISOString() : undefined,
      notes: notes.trim() || undefined,
      prescription: formattedItems.length > 0 ? { items: formattedItems } : undefined,
    };

    try {
      await api.post('/records/create', payload);
      showToast('success', 'Medical record created successfully!');
      
      // Clear current states and refresh
      setSelectedPatientId(null);
      setSelectedAppointmentId(null);
      setSelectedPatient(null);
      setMedicalHistory([]);
      
      // Refresh sidebar list
      fetchAppointments();
    } catch (err: any) {
      console.error('Error submitting medical record:', err);
      showToast('error', err.response?.data?.message || err.response?.data?.error || 'Failed to create medical record.');
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
            <p className="text-xs text-slate-500">Doctor Clinical Station</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsCertDrawerOpen(true)}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg text-xs font-bold border border-slate-750 transition-all flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            <span>Certificates Panel</span>
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
        {/* Left Sidebar: Walk-in lookup + Scheduled Appointments */}
        <aside className="w-80 border-r border-slate-800 bg-[#0f1422] p-5 flex flex-col gap-6 shrink-0 overflow-y-auto">
          {/* Walk-in Lookup */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Walk-in Patient Lookup</h3>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Lookup NIC, Name, ID..."
                className="w-full pl-9 pr-4 py-2 bg-[#0b0f19] border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 transition-all text-xs text-white"
              />
              
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-[#151c2c] border border-slate-800 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto p-1.5 space-y-1">
                  {searchResults.map((patient) => (
                    <button
                      key={patient.id}
                      onClick={() => handleSelectPatient(patient.id)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800/80 transition-all text-xs flex flex-col gap-0.5"
                    >
                      <span className="font-semibold text-white">{patient.name}</span>
                      <span className="text-[10px] text-slate-500">{getPatientDisplayId(patient)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Appointments Sidebar */}
          <div className="flex-1 flex flex-col min-h-0 gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Scheduled Today</h4>
              <span className="text-[10px] text-slate-500 font-bold bg-[#0b0f19] px-2 py-0.5 rounded-full">
                {appointments.length}
              </span>
            </div>

            {loadingAppointments ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                <span className="text-xs">Loading appointments...</span>
              </div>
            ) : appointments.length > 0 ? (
              <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
                {appointments.map((appt) => {
                  const patientUser = appt.patient.user;
                  const displayId = patientUser.student?.university_reg_number || patientUser.academicStaff?.university_staff_id || patientUser.nic;
                  const time = new Date(appt.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  
                  return (
                    <button
                      key={appt.id}
                      onClick={() => handleSelectPatient(appt.patient_id, appt.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 relative overflow-hidden ${
                        selectedAppointmentId === appt.id
                          ? 'bg-slate-800/80 border-emerald-500/40 shadow-md shadow-emerald-950/10'
                          : 'bg-[#151b2c] hover:bg-slate-800/40 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-xs text-white truncate max-w-[150px]">{patientUser.name}</span>
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                          <Clock className="w-3 h-3" />
                          <span>{time}</span>
                        </div>
                      </div>
                      
                      <div className="text-[10px] text-slate-500">
                        <p>ID: {displayId}</p>
                        <p className="mt-1 italic border-l-2 border-slate-700 pl-1.5 truncate text-slate-400">"{appt.reason}"</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
                <Calendar className="w-6 h-6 text-slate-750" />
                <span>No appointments scheduled.</span>
              </div>
            )}
          </div>
        </aside>

        {/* Main Work Area: History timeline (left) + Clinical Interaction form (right) */}
        <main className="flex-1 bg-[#0b0f19] p-6 overflow-hidden flex gap-6">
          {loadingPatient ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
              <span className="text-sm">Fetching patient clinical history...</span>
            </div>
          ) : selectedPatient ? (
            <div className="flex-1 flex gap-6 overflow-hidden">
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

              {/* Left Column: Demographics + Historical Timeline */}
              <div className="w-1/2 flex flex-col gap-4 overflow-hidden h-full">
                {/* Patient Profile Card */}
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-xl shrink-0 relative overflow-hidden">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Demographics & Clinical baseline</h3>
                  <h2 className="text-lg font-extrabold text-white leading-tight">{selectedPatient.name}</h2>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs text-slate-400">
                    <div><span className="text-slate-600">NIC:</span> {selectedPatient.nic}</div>
                    <div><span className="text-slate-600">ID:</span> {getPatientDisplayId(selectedPatient)}</div>
                    <div><span className="text-slate-600">Blood:</span> {selectedPatient.patientProfile?.blood_group || 'Not Set'}</div>
                    <div><span className="text-slate-600">DOB:</span> {selectedPatient.patientProfile?.date_of_birth ? new Date(selectedPatient.patientProfile.date_of_birth).toLocaleDateString() : 'Not Set'}</div>
                    <div><span className="text-slate-600">Height:</span> {selectedPatient.patientProfile?.height ? `${selectedPatient.patientProfile.height} cm` : 'Not Set'}</div>
                    <div><span className="text-slate-600">Weight:</span> {selectedPatient.patientProfile?.weight ? `${selectedPatient.patientProfile.weight} kg` : 'Not Set'}</div>
                  </div>

                  {selectedPatient.patientProfile?.allergies && (
                    <div className="mt-3 p-2 bg-rose-500/10 border border-rose-500/25 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <span className="font-bold text-rose-300">Allergies: </span>
                        <span className="text-rose-200">{selectedPatient.patientProfile.allergies}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Timeline Card */}
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-3 shrink-0">
                    <History className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-bold text-slate-200">Clinical History Timeline</h3>
                  </div>

                  {loadingHistory ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                      <span className="text-xs">Loading records...</span>
                    </div>
                  ) : medicalHistory.length > 0 ? (
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                      {medicalHistory.map((record) => {
                        const date = new Date(record.visit_date_time).toLocaleDateString();
                        return (
                          <div key={record.id} className="relative pl-4 border-l border-slate-800 pb-2">
                            {/* Dot indicator */}
                            <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-emerald-500" />
                            
                            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                              <span className="font-bold text-emerald-400/90">{date}</span>
                              <span>Dr. {record.doctor_name}</span>
                            </div>

                            <div className="bg-[#151b2c]/80 border border-slate-850 rounded-xl p-3.5 space-y-2">
                              <div>
                                <h4 className="text-xs font-bold text-white mb-0.5">Symptoms / Presentation</h4>
                                <p className="text-xs text-slate-400 leading-relaxed font-mono bg-[#0b0f19] p-1.5 rounded">{record.symptoms}</p>
                              </div>

                              <div>
                                <h4 className="text-xs font-bold text-white mb-0.5">Diagnosis</h4>
                                <p className="text-xs text-slate-350 leading-relaxed">{record.diagnosis}</p>
                              </div>

                              {record.treatment_plan && (
                                <div>
                                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Treatment Plan</h4>
                                  <p className="text-xs text-slate-400 leading-relaxed">{record.treatment_plan}</p>
                                </div>
                              )}

                              {record.prescription?.items && record.prescription.items.length > 0 && (
                                <div className="border-t border-slate-800 pt-2 mt-2">
                                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Prescription</h4>
                                  <div className="space-y-1">
                                    {record.prescription.items.map((item) => (
                                      <div key={item.id} className="text-xs flex items-center justify-between bg-slate-900/60 p-1.5 rounded border border-slate-850">
                                        <div>
                                          <span className="font-semibold text-white">{item.medicine_id ? 'Internal' : 'External'}: </span>
                                          <span className="text-slate-300">{item.external_medicine_name || 'Stock Medicine'}</span>
                                          <span className="text-[10px] text-slate-500 block">{item.dosage}</span>
                                        </div>
                                        <span className="text-emerald-400 font-bold">Qty: {item.quantity}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 text-xs py-8 text-center">
                      <Clock className="w-8 h-8 text-slate-850 mb-2" />
                      <span>No previous medical history recorded.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: New interaction form */}
              <div className="w-1/2 bg-[#111827] border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl overflow-y-auto h-full flex flex-col">
                <div className="border-b border-slate-800 pb-3 mb-4 shrink-0">
                  <h3 className="text-sm font-extrabold text-slate-200">New Clinical Interaction Log</h3>
                  <p className="text-xs text-slate-500">Record symptoms, diagnosis, and issue prescriptions</p>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-5 flex-1 flex flex-col min-h-0">
                  {/* Form fields wrapper */}
                  <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                    {/* Symptoms */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Symptoms / Chief Complaint</label>
                      <textarea
                        value={symptoms}
                        onChange={(e) => setSymptoms(e.target.value)}
                        placeholder="Describe patient presentation..."
                        rows={2}
                        className="w-full px-3.5 py-2 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 text-xs text-white resize-none font-mono"
                        required
                      />
                    </div>

                    {/* Diagnosis */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Diagnosis</label>
                      <textarea
                        value={diagnosis}
                        onChange={(e) => setDiagnosis(e.target.value)}
                        placeholder="Provide medical diagnosis..."
                        rows={2}
                        className="w-full px-3.5 py-2 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 text-xs text-white resize-none"
                        required
                      />
                    </div>

                    {/* Treatment Plan */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Treatment Plan (Optional)</label>
                      <textarea
                        value={treatmentPlan}
                        onChange={(e) => setTreatmentPlan(e.target.value)}
                        placeholder="Outline clinical directions/plan..."
                        rows={2}
                        className="w-full px-3.5 py-2 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 text-xs text-white resize-none"
                      />
                    </div>

                    {/* Prescription Builder */}
                    <div className="border-t border-slate-800 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wider">Prescribe Medication</h4>
                        <button
                          type="button"
                          onClick={handleAddPrescriptionItem}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 hover:text-emerald-350 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Medicine</span>
                        </button>
                      </div>

                      {prescriptionItems.length > 0 ? (
                        <div className="space-y-3.5">
                          {prescriptionItems.map((item, index) => (
                            <div key={item.key} className="p-3 bg-[#151b2c]/80 border border-slate-800 rounded-xl space-y-2.5 relative">
                              {/* Remove Button */}
                              <button
                                type="button"
                                onClick={() => handleRemovePrescriptionItem(index)}
                                className="absolute top-2.5 right-2.5 text-slate-500 hover:text-rose-400 transition-colors p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>

                              {/* Search Medicine Catalog */}
                              <div className="w-[85%] relative">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Search Catalog</label>
                                <input
                                  type="text"
                                  value={item.search_query}
                                  onChange={(e) => handleMedicineSearch(index, e.target.value)}
                                  placeholder="Type name (e.g. Paracetamol)..."
                                  className="w-full px-2.5 py-1.5 bg-[#0b0f19] border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                                />

                                {item.show_dropdown && item.suggestions.length > 0 && (
                                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#1a2336] border border-slate-750 rounded-xl shadow-2xl z-50 max-h-40 overflow-y-auto p-1">
                                    {item.suggestions.map((med) => (
                                      <button
                                        key={med.id}
                                        type="button"
                                        onClick={() => handleSelectMedicine(index, med)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-850 transition-all text-xs flex flex-col"
                                      >
                                        <span className="font-semibold text-white">{med.name}</span>
                                        <span className="text-[10px] text-slate-500">{med.display_string}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Meta Details & Source */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Source</span>
                                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full inline-block border ${
                                    item.source === 'INTERNAL'
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                      : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                  }`}>
                                    {item.source}
                                  </span>
                                  {item.source === 'EXTERNAL' && (
                                    <span className="text-[9px] text-amber-500 block mt-1 leading-tight">Out of stock. Dispensed externally.</span>
                                  )}
                                </div>

                                {item.source === 'INTERNAL' && (
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Stock Available</span>
                                    <span className="text-xs text-slate-350 font-bold">{item.available_stock} {item.unit}</span>
                                  </div>
                                )}
                              </div>

                              {/* Dosage & Qty */}
                              <div className="grid grid-cols-2 gap-3 pt-1">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Dosage</label>
                                  <input
                                    type="text"
                                    value={item.dosage}
                                    onChange={(e) => {
                                      const updated = [...prescriptionItems];
                                      updated[index].dosage = e.target.value;
                                      setPrescriptionItems(updated);
                                    }}
                                    placeholder="1 tab / thrice daily"
                                    className="w-full px-2.5 py-1.5 bg-[#0b0f19] border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                                    required
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Quantity</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => handleQuantityChange(index, Number(e.target.value))}
                                    className="w-full px-2.5 py-1.5 bg-[#0b0f19] border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white font-mono"
                                    required
                                  />
                                </div>
                              </div>

                              {/* Instructions */}
                              <div className="pt-0.5">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Special Instructions (Optional)</label>
                                <input
                                  type="text"
                                  value={item.instructions}
                                  onChange={(e) => {
                                    const updated = [...prescriptionItems];
                                    updated[index].instructions = e.target.value;
                                    setPrescriptionItems(updated);
                                  }}
                                  placeholder="e.g. after meals"
                                  className="w-full px-2.5 py-1.5 bg-[#0b0f19] border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-slate-600 text-xs border border-dashed border-slate-800 rounded-xl">
                          No medicines added. Click "Add Medicine" to prescribe items.
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
                      {/* Follow up date */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Follow-up Date (Optional)</label>
                        <input
                          type="date"
                          value={followUpDate}
                          onChange={(e) => setFollowUpDate(e.target.value)}
                          className="w-full px-3.5 py-2 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 text-xs text-white"
                        />
                      </div>

                      {/* Prescription Notes */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Prescription Notes (Optional)</label>
                        <input
                          type="text"
                          value={prescriptionNotes}
                          onChange={(e) => setPrescriptionNotes(e.target.value)}
                          placeholder="e.g. take with plenty of water"
                          className="w-full px-3.5 py-2 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 text-xs text-white"
                        />
                      </div>
                    </div>

                    {/* Private Internal Notes */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Private Notes (Optional)</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Internal practitioner notes..."
                        rows={1.5}
                        className="w-full px-3.5 py-2 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 placeholder-slate-700 text-xs text-white resize-none"
                      />
                    </div>
                  </div>

                  {/* Submission Row */}
                  <div className="flex gap-4 pt-3 border-t border-slate-800 shrink-0 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatientId(null);
                        setSelectedAppointmentId(null);
                        setSelectedPatient(null);
                        setMedicalHistory([]);
                      }}
                      disabled={submitting}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 rounded-xl text-xs font-bold border border-slate-750 transition-all"
                    >
                      Clear Selection
                    </button>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Submitting Log...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Submit Record & Prescribe</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3 text-center max-w-sm mx-auto h-full">
              <div className="p-4 bg-slate-800/40 border border-slate-800 text-emerald-400 rounded-2xl shrink-0">
                <Clock className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-white mt-2">No Active Case Loaded</h2>
              <p className="text-xs leading-relaxed">
                Select an appointment from the "Scheduled Today" list on the left, or query a patient via "Walk-in Patient Lookup" to start recording clinical entries.
              </p>
            </div>
          )}
        </main>
      </div>
      
      <CertificateDrawer
        isOpen={isCertDrawerOpen}
        onClose={() => setIsCertDrawerOpen(false)}
        onProcessed={() => {
          if (selectedPatientId) {
            handleSelectPatient(selectedPatientId, selectedAppointmentId || undefined);
          }
        }}
      />
    </div>
  );
}
