'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, User, Calendar, Activity, Weight, FileText, FileHeart, PlusCircle, Save, Edit3, Loader2, CheckCircle2, AlertTriangle, ShieldAlert, Plus, Trash2, Clock, History, AlertCircle, ExternalLink, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import api from '@/lib/axios';
import CertificateDrawer from './components/CertificateDrawer';
import UserProfilePanel from '@/components/UserProfilePanel';

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

interface AvailabilityDay {
  day_of_week: number;
  label: string;
  is_available: boolean;
  start_time: string;
  end_time: string;
}

const DEFAULT_AVAILABILITY_SCHEDULE: AvailabilityDay[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
].map((label, day_of_week) => ({
  day_of_week,
  label,
  is_available: false,
  start_time: '09:00',
  end_time: '17:00',
}));

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
  reports: MedicalReport[];
  prescription?: {
    items: {
      id: string;
      medicine_id: string | null;
      medicine_name?: string | null;
      external_medicine_name: string | null;
      dosage: string;
      quantity: number;
      instructions: string | null;
      source: 'INTERNAL' | 'EXTERNAL';
    }[]
  } | null;
}

interface MedicalReport {
  id: string;
  record_id: string;
  file_url: string;
  type: string;
  upload_time: string;
}

interface ClinicalReportNotification extends MedicalReport {
  patient_id: string;
  patient_name: string;
  visit_date: string;
  diagnosis: string;
}

interface PatientTimelineReport extends MedicalReport {
  visit_date: string;
  diagnosis: string;
}

type DoctorHistoryPeriod = 'today' | 'week' | 'month' | 'all';

interface DoctorHistoryRecord {
  id: string;
  visit_date_time: string;
  patient: {
    id: string;
    name: string;
    email: string;
    nic: string;
    role: string;
    registration_number: string | null;
  };
  symptoms: string;
  diagnosis: string;
  treatment_plan: string | null;
  prescription_notes: string | null;
  follow_up_date: string | null;
  notes: string | null;
  prescription: {
    id: string;
    issued_timestamp: string;
    items: {
      id: string;
      medicine_id: string | null;
      medicine_name: string | null;
      external_medicine_name: string | null;
      dosage: string;
      quantity: number;
      instructions: string | null;
      source: 'INTERNAL' | 'EXTERNAL';
    }[];
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
  // Certificate Drawer State
  const [isCertDrawerOpen, setIsCertDrawerOpen] = useState(false);

  // Appointments Sidebar States
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilitySchedule, setAvailabilitySchedule] = useState<AvailabilityDay[]>(
    DEFAULT_AVAILABILITY_SCHEDULE
  );
  const [isDoctorHistoryOpen, setIsDoctorHistoryOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [activeWorkspace, setActiveWorkspace] = useState<'schedule' | 'history' | 'certificates'>('schedule');
  const [pendingCertificateCount, setPendingCertificateCount] = useState(0);
  const [doctorHistory, setDoctorHistory] = useState<DoctorHistoryRecord[]>([]);
  const [doctorHistoryPeriod, setDoctorHistoryPeriod] = useState<DoctorHistoryPeriod>('all');
  const [doctorHistoryPage, setDoctorHistoryPage] = useState(1);
  const [doctorHistoryTotalPages, setDoctorHistoryTotalPages] = useState(0);
  const [doctorHistoryTotal, setDoctorHistoryTotal] = useState(0);
  const [loadingDoctorHistory, setLoadingDoctorHistory] = useState(false);

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
  const [reportNotifications, setReportNotifications] = useState<ClinicalReportNotification[]>([]);
  const [showReportNotifications, setShowReportNotifications] = useState(false);
  const [loadingReportNotifications, setLoadingReportNotifications] = useState(false);
  const [readReportIds, setReadReportIds] = useState<string[]>([]);

  // Form Fields
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [prescriptionNotes, setPrescriptionNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [notes, setNotes] = useState('');

  // Prescription Items
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionFormItem[]>([]);
  const [availableMedicines, setAvailableMedicines] = useState<Medicine[]>([]);
  const [showMedicinePicker, setShowMedicinePicker] = useState(false);
  const [loadingAvailableMedicines, setLoadingAvailableMedicines] = useState(false);

  // Feedback states
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  }, []);

  const unreadReportCount = reportNotifications.filter(
    (report) => !readReportIds.includes(report.id)
  ).length;

  const conflictingAppointmentIds = useMemo(() => {
    const appointmentsByTime = new Map<number, string[]>();

    appointments.forEach((appointment) => {
      const timestamp = new Date(appointment.scheduled_time).getTime();
      const appointmentIds = appointmentsByTime.get(timestamp) || [];
      appointmentIds.push(appointment.id);
      appointmentsByTime.set(timestamp, appointmentIds);
    });

    return new Set(
      Array.from(appointmentsByTime.values())
        .filter((appointmentIds) => appointmentIds.length > 1)
        .flat()
    );
  }, [appointments]);

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

  const fetchAvailability = useCallback(async () => {
    setLoadingAvailability(true);
    try {
      const response = await api.get('/availability/medicalstaff');
      const savedSchedule = response.data?.data?.schedule;

      if (!Array.isArray(savedSchedule)) {
        throw new Error('Availability response did not contain a schedule.');
      }

      setAvailabilitySchedule(
        DEFAULT_AVAILABILITY_SCHEDULE.map((defaultDay) => {
          const savedDay = savedSchedule.find(
            (day: { day_of_week: number }) => day.day_of_week === defaultDay.day_of_week
          );

          if (!savedDay) return defaultDay;

          const startDate = new Date(savedDay.start_time);
          const endDate = new Date(savedDay.end_time);
          if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            throw new Error(`Invalid availability time for ${defaultDay.label}.`);
          }

          return {
            ...defaultDay,
            is_available: savedDay.is_available,
            start_time: `${String(startDate.getUTCHours()).padStart(2, '0')}:${String(
              startDate.getUTCMinutes()
            ).padStart(2, '0')}`,
            end_time: `${String(endDate.getUTCHours()).padStart(2, '0')}:${String(
              endDate.getUTCMinutes()
            ).padStart(2, '0')}`,
          };
        })
      );
    } catch (err: any) {
      console.error('Error fetching availability:', err);
      showToast(
        'error',
        err.response?.data?.message || err.message || 'Failed to load your availability schedule.'
      );
    } finally {
      setLoadingAvailability(false);
    }
  }, [showToast]);

  const fetchDoctorHistory = useCallback(async (period: DoctorHistoryPeriod, page: number) => {
    setLoadingDoctorHistory(true);
    try {
      const response = await api.get('/doctor/history', {
        params: { period, page, limit: 20 },
      });
      const data = response.data?.data;

      if (!data || !Array.isArray(data.records) || !data.pagination) {
        throw new Error('Doctor history response was incomplete.');
      }

      setDoctorHistory(data.records);
      setDoctorHistoryPage(data.pagination.page);
      setDoctorHistoryTotalPages(data.pagination.total_pages);
      setDoctorHistoryTotal(data.pagination.total);
    } catch (err: any) {
      console.error('Error fetching doctor history:', err);
      setDoctorHistory([]);
      setDoctorHistoryTotalPages(0);
      setDoctorHistoryTotal(0);
      showToast(
        'error',
        err.response?.data?.message || 'Failed to load your treatment history.'
      );
    } finally {
      setLoadingDoctorHistory(false);
    }
  }, [showToast]);

  const fetchReportNotifications = useCallback(async () => {
    setLoadingReportNotifications(true);
    try {
      const response = await api.get('/clinical/reports');
      setReportNotifications(response.data?.data?.reports || []);
    } catch (err: any) {
      console.error('Error fetching clinical reports:', err);
      showToast(
        'error',
        err.response?.data?.message || 'Failed to load uploaded medical reports.'
      );
    } finally {
      setLoadingReportNotifications(false);
    }
  }, [showToast]);

  const handleOpenReport = async (report: MedicalReport) => {
    try {
      const response = await api.get('/documents/sign-url', {
        params: { file_path: report.file_url },
      });
      const signedUrl = response.data?.data?.signed_url;

      if (!signedUrl) {
        throw new Error('The report did not include a secure access URL.');
      }

      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      console.error('Error opening medical report:', err);
      showToast(
        'error',
        err.response?.data?.message || 'Failed to open the medical report.'
      );
    }
  };

  const handleSelectReportNotification = (report: ClinicalReportNotification) => {
    const updatedReadReportIds = Array.from(new Set([...readReportIds, report.id]));
    setReadReportIds(updatedReadReportIds);
    localStorage.setItem('doctor_read_report_ids', JSON.stringify(updatedReadReportIds));
    setShowReportNotifications(false);
    handleSelectPatient(report.patient_id);
  };

  useEffect(() => {
    try {
      const savedReadReportIds = JSON.parse(
        localStorage.getItem('doctor_read_report_ids') || '[]'
      );
      if (Array.isArray(savedReadReportIds)) {
        setReadReportIds(savedReadReportIds.filter((id): id is string => typeof id === 'string'));
      }
    } catch (err) {
      console.error('Error loading report read state:', err);
    }
  }, []);

  // Fetch dashboard data on mount.
  useEffect(() => {
    fetchAppointments();
    fetchAvailability();
    fetchDoctorHistory('all', 1);
    fetchReportNotifications();
  }, [fetchAvailability, fetchDoctorHistory, fetchReportNotifications]);

  const handleAvailabilityChange = (
    dayOfWeek: number,
    field: 'is_available' | 'start_time' | 'end_time',
    value: boolean | string
  ) => {
    setAvailabilitySchedule((current) =>
      current.map((day) =>
        day.day_of_week === dayOfWeek ? { ...day, [field]: value } : day
      )
    );
  };

  const handleAvailabilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);

    const invalidDay = availabilitySchedule.find(
      (day) =>
        day.is_available &&
        (!day.start_time ||
          !day.end_time ||
          day.start_time >= day.end_time)
    );

    if (invalidDay) {
      showToast(
        'error',
        `${invalidDay.label}: the ending time must be later than the starting time.`
      );
      return;
    }

    setSavingAvailability(true);

    const schedule = availabilitySchedule.map((day) => {
      const baseDate = new Date(Date.UTC(1970, 0, 4 + day.day_of_week));
      const [startHour, startMinute] = day.start_time.split(':').map(Number);
      const [endHour, endMinute] = day.end_time.split(':').map(Number);

      const startTime = new Date(baseDate);
      startTime.setUTCHours(startHour, startMinute, 0, 0);

      const endTime = new Date(baseDate);
      endTime.setUTCHours(endHour, endMinute, 0, 0);

      return {
        day_of_week: day.day_of_week,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        is_available: day.is_available,
      };
    });

    try {
      const response = await api.put('/availability/medicalstaff', { schedule });
      await fetchAvailability();
      showToast(
        'success',
        response.data?.message || 'Weekly availability schedule saved successfully.'
      );
    } catch (err: any) {
      showToast(
        'error',
        err.response?.data?.message || 'Failed to save your availability schedule.'
      );
    } finally {
      setSavingAvailability(false);
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
        const history = historyRes.data.data.history || [];

        try {
          const catalogResponse = await api.get('/medicines/catalog?search=');
          const catalog = catalogResponse.data?.data?.catalog || [];
          const medicineNames = new Map<string, string>(
            catalog.map((medicine: Medicine) => [medicine.id, medicine.name])
          );

          setMedicalHistory(
            history.map((record: MedicalRecordItem) => ({
              ...record,
              prescription: record.prescription
                ? {
                    ...record.prescription,
                    items: record.prescription.items.map((item) => ({
                      ...item,
                      medicine_name:
                        item.medicine_name ||
                        (item.medicine_id ? medicineNames.get(item.medicine_id) || null : null),
                    })),
                  }
                : null,
            }))
          );
        } catch (err) {
          console.error('Error resolving prescription medicine names:', err);
          setMedicalHistory(history);
        }
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
        updated[index].suggestions = (response.data.data.catalog || []).filter(
          (medicine: Medicine) => medicine.total_available_stock > 0
        );
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

  const handleOpenMedicinePicker = async () => {
    setShowMedicinePicker(true);
    setLoadingAvailableMedicines(true);

    try {
      const response = await api.get('/medicines/catalog?search=');
      setAvailableMedicines(
        (response.data?.data?.catalog || []).filter(
          (medicine: Medicine) => medicine.total_available_stock > 0
        )
      );
    } catch (err) {
      console.error('Medicine catalog loading error:', err);
      showToast('error', 'Failed to load available medicines.');
    } finally {
      setLoadingAvailableMedicines(false);
    }
  };

  const handleSelectAvailableMedicine = (medicine: Medicine) => {
    setPrescriptionItems([
      ...prescriptionItems,
      {
        key: String(Date.now()) + Math.random(),
        medicine_id: medicine.id,
        search_query: medicine.name,
        external_medicine_name: null,
        dosage: '',
        quantity: 1,
        instructions: '',
        source: 'INTERNAL',
        available_stock: medicine.total_available_stock,
        unit: medicine.unit,
        suggestions: [],
        show_dropdown: false,
      },
    ]);
    setShowMedicinePicker(false);
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

  const selectedPatientReports: PatientTimelineReport[] = medicalHistory
    .flatMap((record) =>
      record.reports.map((report) => ({
        ...report,
        visit_date: record.visit_date_time,
        diagnosis: record.diagnosis,
      }))
    )
    .sort(
      (a, b) =>
        new Date(b.upload_time).getTime() - new Date(a.upload_time).getTime()
    );

  return (
    <div className={`doctor-dashboard min-h-screen bg-[#07131a] text-slate-100 flex flex-col font-sans ${isSidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      {/* Header Bar */}
      <header className="sticky top-0 z-50 bg-[#0d1726]/85 border-b border-slate-700/80 px-6 py-4 flex items-center justify-between shrink-0 backdrop-blur-sm">
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
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowReportNotifications((current) => !current);
                if (!showReportNotifications) {
                  fetchReportNotifications();
                }
              }}
              className={`relative rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                unreadReportCount > 0
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                  : 'border-slate-750 bg-slate-800 text-slate-350 hover:bg-slate-700 hover:text-white'
              }`}
              aria-label="Uploaded medical reports"
            >
              <FileHeart className="h-4 w-4" />
              {unreadReportCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-slate-950">
                  {unreadReportCount > 9 ? '9+' : unreadReportCount}
                </span>
              )}
            </button>

            {showReportNotifications && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] overflow-hidden rounded-xl border border-slate-700 bg-[#111827] shadow-2xl">
                <div className="border-b border-slate-800 px-4 py-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Uploaded Medical Reports
                  </h3>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Select a patient to review their clinical timeline.
                  </p>
                </div>
                <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-2">
                  {loadingReportNotifications ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                      Loading reports...
                    </div>
                  ) : reportNotifications.length > 0 ? (
                    reportNotifications.map((report) => {
                      const isRead = readReportIds.includes(report.id);
                      return (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() => handleSelectReportNotification(report)}
                        className={`mb-1 flex w-full items-start justify-between rounded-lg p-3 text-left transition-colors hover:bg-slate-800 ${
                          isRead ? 'opacity-60' : 'bg-amber-500/5'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 truncate text-xs font-bold text-white">
                            {!isRead && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                            {report.patient_name}
                          </span>
                          <span className="mt-1 block text-[10px] text-slate-400">
                            {report.type.replace(/[_-]/g, ' ')} · {new Date(report.upload_time).toLocaleDateString()}
                          </span>
                          <span className="mt-1 block truncate text-[10px] text-slate-500">
                            {report.diagnosis}
                          </span>
                        </span>
                        <ExternalLink className="ml-3 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      </button>
                      );
                    })
                  ) : (
                    <p className="py-8 text-center text-xs text-slate-500">No uploaded reports.</p>
                  )}
                </div>

              </div>
            )}
          </div>
          <UserProfilePanel />
        </div>
      </header>

      {toast && (
        <div
          className={`fixed right-6 top-20 z-[60] flex items-center gap-3 rounded-xl border p-4 shadow-2xl ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" />
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {isDoctorHistoryOpen && activeWorkspace === 'history' && (
        <div className="doctor-history-workspace doctor-tab-workspace flex min-h-0 flex-1 items-stretch overflow-hidden bg-[#08131c] p-6">
          <section className="doctor-tab-panel doctor-tab-content mx-auto flex h-full w-full max-w-5xl flex-col gap-5 overflow-hidden">
            <div className="doctor-tab-header flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-extrabold text-white">
                  <History className="h-5 w-5 text-emerald-400" />
                  My Treatment History
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {doctorHistoryTotal} record{doctorHistoryTotal === 1 ? '' : 's'} found
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDoctorHistoryOpen(false);
                  setActiveWorkspace('schedule');
                }}
                className="hidden"
              >
                Close
              </button>
            </div>

            <div className="doctor-tab-toolbar flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#111827] p-5 shadow-xl">
              <div className="flex gap-1 rounded-lg bg-[#0b0f19] p-1">
                {(['today', 'week', 'month', 'all'] as DoctorHistoryPeriod[]).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => {
                      setDoctorHistoryPeriod(period);
                      fetchDoctorHistory(period, 1);
                    }}
                    className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      doctorHistoryPeriod === period
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => fetchDoctorHistory(doctorHistoryPeriod, doctorHistoryPage)}
                disabled={loadingDoctorHistory}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-bold text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Loader2 className={`h-3.5 w-3.5 ${loadingDoctorHistory ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="doctor-tab-body min-h-0 flex-1 overflow-y-auto">
              {loadingDoctorHistory ? (
                <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                  <span className="text-xs">Loading treatment history...</span>
                </div>
              ) : doctorHistory.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center text-slate-500">
                  <Clock className="h-8 w-8 text-slate-700" />
                  <span className="text-sm">No treatment records for this period.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {doctorHistory.map((record) => (
                    <article
                      key={record.id}
                      className="doctor-history-card rounded-2xl border border-slate-800 bg-[#111827] p-5 shadow-xl"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-white">{record.patient.name}</h3>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {record.patient.registration_number || record.patient.nic} ·{' '}
                            {record.patient.role}
                          </p>
                        </div>
                        <time className="text-[10px] font-bold text-emerald-400">
                          {new Date(record.visit_date_time).toLocaleString()}
                        </time>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="doctor-history-tile rounded-xl border border-slate-800 bg-[#151b2c] p-3">
                          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Symptoms
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-slate-300">
                            {record.symptoms}
                          </p>
                        </div>
                        <div className="doctor-history-tile rounded-xl border border-slate-800 bg-[#151b2c] p-3">
                          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Diagnosis
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-slate-300">
                            {record.diagnosis}
                          </p>
                        </div>
                      </div>

                      {record.treatment_plan && (
                        <div className="doctor-history-tile mt-3 rounded-xl border border-slate-800 bg-[#151b2c] p-3">
                          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Treatment Plan
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-slate-300">
                            {record.treatment_plan}
                          </p>
                        </div>
                      )}

                      {record.prescription?.items.length ? (
                        <div className="doctor-history-prescription mt-3 border-t border-slate-800 pt-3">
                          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Prescription
                          </h4>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {record.prescription.items.map((item) => (
                              <span
                                key={item.id}
                                className="rounded-lg border border-slate-700 bg-[#0b0f19] px-2.5 py-1.5 text-[10px] text-slate-300"
                              >
                                {item.medicine_name || item.external_medicine_name || 'Unnamed medicine'} ·{' '}
                                {item.dosage} · Qty {item.quantity}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#111827] px-5 py-3 shadow-xl">
              <span className="text-[10px] text-slate-500">
                Page {doctorHistoryPage} of {Math.max(doctorHistoryTotalPages, 1)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loadingDoctorHistory || doctorHistoryPage <= 1}
                  onClick={() => fetchDoctorHistory(doctorHistoryPeriod, doctorHistoryPage - 1)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={
                    loadingDoctorHistory ||
                    doctorHistoryPage >= doctorHistoryTotalPages ||
                    doctorHistoryTotalPages === 0
                  }
                  onClick={() => fetchDoctorHistory(doctorHistoryPeriod, doctorHistoryPage + 1)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Walk-in lookup + Scheduled Appointments */}
        <aside
          className={`${
            isSidebarCollapsed ? 'w-20' : 'w-64'
          } doctor-workspace-sidebar border-r border-slate-700/80 bg-[#0d1726]/85 hidden md:flex flex-col p-4 shrink-0 overflow-y-auto backdrop-blur-sm transition-[width] duration-300`}
        >
          <div className={`mb-8 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-end'} gap-3`}>
            {!isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                aria-label="Collapse doctor sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </div>

          {false && (
            <>
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

          <div className="flex flex-col gap-2 border-b border-slate-800 pb-5">
            <button
              type="button"
              onClick={() => {
                setActiveWorkspace('history');
                setIsDoctorHistoryOpen(true);
                fetchDoctorHistory(doctorHistoryPeriod, doctorHistoryPage);
              }}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <History className="h-4 w-4" />
              <span>My Treatment History</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveWorkspace('certificates');
                setIsCertDrawerOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <FileText className="h-4 w-4" />
              <span>Certificate Requests</span>
            </button>
          </div>

          {/* Weekly Availability */}
          <form
            onSubmit={handleAvailabilitySubmit}
            className="hidden"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Weekly Availability
                </h3>
                <p className="text-[10px] text-slate-600 mt-1">
                  Set the hours patients can book
                </p>
              </div>
              {loadingAvailability ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              ) : (
                <Calendar className="w-4 h-4 text-emerald-400" />
              )}
            </div>

            <div className="space-y-2.5">
              {availabilitySchedule.map((day) => (
                <div
                  key={day.day_of_week}
                  className="rounded-lg border border-slate-800 bg-[#0b0f19] p-2.5 space-y-2"
                >
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-semibold text-slate-200">{day.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">
                        {day.is_available ? 'Available' : 'Unavailable'}
                      </span>
                      <input
                        type="checkbox"
                        checked={day.is_available}
                        onChange={(e) =>
                          handleAvailabilityChange(
                            day.day_of_week,
                            'is_available',
                            e.target.checked
                          )
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </span>
                  </label>

                  {day.is_available && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-slate-500">
                        Start
                        <input
                          type="time"
                          value={day.start_time}
                          onChange={(e) =>
                            handleAvailabilityChange(
                              day.day_of_week,
                              'start_time',
                              e.target.value
                            )
                          }
                          className="mt-1 w-full rounded-md border border-slate-800 bg-[#151b2c] px-2 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </label>
                      <label className="text-[10px] text-slate-500">
                        End
                        <input
                          type="time"
                          value={day.end_time}
                          onChange={(e) =>
                            handleAvailabilityChange(
                              day.day_of_week,
                              'end_time',
                              e.target.value
                            )
                          }
                          className="mt-1 w-full rounded-md border border-slate-800 bg-[#151b2c] px-2 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={savingAvailability}
              className="w-full rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400 border border-emerald-500/20 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingAvailability ? 'Saving Schedule...' : 'Save Availability'}
            </button>
          </form>

          {/* Appointments Sidebar */}
          <div className="order-1 flex-1 flex flex-col min-h-0 gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Scheduled Today</h4>
              <span className="text-[10px] text-slate-500 font-bold bg-[#0b0f19] px-2 py-0.5 rounded-full">
                {appointments.length}
              </span>
            </div>

            {conflictingAppointmentIds.size > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div className="text-[11px] leading-4">
                  <p className="font-bold text-amber-300">Overlapping appointments detected</p>
                  <p className="mt-1 text-amber-200/80">
                    {conflictingAppointmentIds.size} appointments share an exact time slot. Review the highlighted entries before starting a consultation.
                  </p>
                </div>
              </div>
            )}

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
                  const hasTimeConflict = conflictingAppointmentIds.has(appt.id);
                  
                  return (
                    <button
                      key={appt.id}
                      onClick={() => handleSelectPatient(appt.patient_id, appt.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 relative overflow-hidden ${
                        selectedAppointmentId === appt.id
                          ? 'bg-slate-800/80 border-emerald-500/40 shadow-md shadow-emerald-950/10'
                          : hasTimeConflict
                            ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/40'
                            : 'bg-[#151b2c] hover:bg-slate-800/40 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-xs text-white truncate max-w-[150px]">{patientUser.name}</span>
                        <div className={`flex items-center gap-1 text-[10px] font-semibold ${hasTimeConflict ? 'text-amber-300' : 'text-emerald-400'}`}>
                          <Clock className="w-3 h-3" />
                          <span>{time}</span>
                          {hasTimeConflict && <AlertTriangle className="ml-1 h-3 w-3" />}
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
            </>
          )}
          {true && (
            <nav className="flex flex-1 flex-col gap-2">
              <button
                type="button"
                onClick={() => setActiveWorkspace('schedule')}
                title={isSidebarCollapsed ? 'Schedule' : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${isSidebarCollapsed ? 'justify-center px-2' : ''} ${activeWorkspace === 'schedule' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'}`}
                aria-label="Schedule"
              >
                <Calendar className="h-5 w-5" />
                {!isSidebarCollapsed && <span className="text-xs font-semibold">Schedule</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveWorkspace('history');
                  setIsDoctorHistoryOpen(true);
                  fetchDoctorHistory(doctorHistoryPeriod, doctorHistoryPage);
                }}
                title={isSidebarCollapsed ? 'Treatment history' : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${isSidebarCollapsed ? 'justify-center px-2' : ''} ${activeWorkspace === 'history' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'}`}
                aria-label="Treatment history"
              >
                <History className="h-5 w-5" />
                {!isSidebarCollapsed && <span className="text-xs font-semibold">Treatment History</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveWorkspace('certificates');
                  setIsCertDrawerOpen(true);
                }}
                title={isSidebarCollapsed ? 'Certificate Requests' : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${isSidebarCollapsed ? 'justify-center px-2' : ''} ${activeWorkspace === 'certificates' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'}`}
                aria-label="Certificates"
              >
                <span className="relative">
                  <FileText className="h-5 w-5" />
                  {pendingCertificateCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-slate-950">
                      {pendingCertificateCount > 9 ? '9+' : pendingCertificateCount}
                    </span>
                  )}
                </span>
                {!isSidebarCollapsed && <span className="text-xs font-semibold">Certificate Requests</span>}
              </button>
            </nav>
          )}
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="mt-4 flex w-full items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Expand doctor sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
        </aside>

        {/* Main Work Area: History timeline (left) + Clinical Interaction form (right) */}
        <main className={`min-w-0 flex-1 bg-[#08131c] p-6 overflow-hidden flex gap-6 ${activeWorkspace !== 'schedule' ? 'hidden' : ''}`}>
          {loadingPatient ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
              <span className="text-sm">Fetching patient clinical history...</span>
            </div>
          ) : selectedPatient ? (
            <div className="min-w-0 flex-1 flex gap-6 overflow-hidden">
              {/* Left Column: Demographics + Historical Timeline */}
              <div className="min-w-0 w-1/2 flex flex-col gap-4 overflow-hidden h-full">
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

                <div className="shrink-0 rounded-2xl border border-slate-800 bg-[#111827] p-4 shadow-xl">
                  <div className="mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <FileHeart className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-slate-200">Medical Reports Timeline</h3>
                  </div>

                  {selectedPatientReports.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                      {selectedPatientReports.map((report) => (
                        <button
                          key={report.id}
                          type="button"
                          onClick={() => handleOpenReport(report)}
                          className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#151b2c]/80 p-2.5 text-left transition-colors hover:border-amber-500/30 hover:bg-slate-800"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-slate-200">
                              {report.type.replace(/[_-]/g, ' ')}
                            </span>
                            <span className="mt-1 block text-[10px] text-slate-500">
                              Uploaded {new Date(report.upload_time).toLocaleDateString()} · Visit {new Date(report.visit_date).toLocaleDateString()}
                            </span>
                            <span className="mt-1 block truncate text-[10px] text-slate-400">
                              {report.diagnosis}
                            </span>
                          </span>
                          <ExternalLink className="ml-3 h-3.5 w-3.5 shrink-0 text-amber-400" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="py-2 text-center text-[10px] text-slate-500">
                      No medical reports uploaded for this patient.
                    </p>
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
                                          <span className="text-slate-300">
                                            {item.medicine_name || item.external_medicine_name || 'Stock Medicine'}
                                          </span>
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
              <div className="min-w-0 w-1/2 bg-[#111827] border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl overflow-y-auto h-full flex flex-col">
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
                          onClick={() => {
                            if (showMedicinePicker) {
                              setShowMedicinePicker(false);
                            } else {
                              handleOpenMedicinePicker();
                            }
                          }}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 hover:text-emerald-350 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{showMedicinePicker ? 'Hide Medicines' : 'Prescribe Medicine'}</span>
                        </button>
                      </div>

                      {showMedicinePicker && (
                        <div className="available-medicine-picker mb-3 rounded-xl border border-emerald-500/20 bg-[#0f1b28] p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                Available Medicines
                              </h5>
                              <p className="mt-1 text-[9px] text-slate-500">
                                Select a medicine with valid stock.
                              </p>
                            </div>
                            {loadingAvailableMedicines && (
                              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                            )}
                          </div>

                          {!loadingAvailableMedicines && availableMedicines.length > 0 ? (
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                              {availableMedicines.map((medicine) => (
                                <button
                                  key={medicine.id}
                                  type="button"
                                  onClick={() => handleSelectAvailableMedicine(medicine)}
                                  className="available-medicine-option flex items-center justify-between rounded-lg border border-slate-800 bg-[#151b2c] px-2.5 py-2 text-left transition-colors hover:border-emerald-500/40 hover:bg-slate-800"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-[10px] font-bold text-white">{medicine.name}</span>
                                    <span className="mt-0.5 block text-[9px] text-slate-500">
                                      {medicine.category} · {medicine.unit}
                                    </span>
                                  </span>
                                  <span className="ml-2 shrink-0 text-[9px] font-bold text-emerald-400">
                                    {medicine.total_available_stock} available
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : !loadingAvailableMedicines ? (
                            <p className="py-3 text-center text-[10px] text-slate-500">
                              No non-expired medicines are currently available.
                            </p>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => {
                              handleAddPrescriptionItem();
                              setShowMedicinePicker(false);
                            }}
                            className="mt-2 text-[10px] font-bold text-amber-400 transition-colors hover:text-amber-300"
                          >
                            Enter external medicine manually
                          </button>
                        </div>
                      )}

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
            <div className="doctor-schedule-content mx-auto flex w-full max-w-5xl flex-col gap-5 overflow-y-auto">
              <div>
                <h2 className="text-xl font-extrabold text-white">Doctor Schedule</h2>
                <p className="mt-1 text-xs text-slate-500">Start a walk-in consultation or select an appointment for today.</p>
              </div>

              <form
                onSubmit={handleAvailabilitySubmit}
                className="doctor-schedule-panel order-3 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200">
                      <Calendar className="h-4 w-4 text-emerald-400" />
                      Weekly Availability
                    </h3>
                    <p className="mt-1 text-[10px] text-slate-500">Set the hours patients can book.</p>
                  </div>
                  {loadingAvailability && <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {availabilitySchedule.map((day) => (
                    <div key={day.day_of_week} className="rounded-lg border border-slate-800 bg-[#0b0f19] p-3">
                      <label className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">{day.label}</span>
                        <input
                          type="checkbox"
                          checked={day.is_available}
                          onChange={(e) => handleAvailabilityChange(day.day_of_week, 'is_available', e.target.checked)}
                          className="h-4 w-4 accent-emerald-500"
                        />
                      </label>
                      {day.is_available && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-[10px] text-slate-500">
                            Start
                            <input
                              type="time"
                              value={day.start_time}
                              onChange={(e) => handleAvailabilityChange(day.day_of_week, 'start_time', e.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-800 bg-[#151b2c] px-2 py-1.5 text-xs text-white"
                            />
                          </label>
                          <label className="text-[10px] text-slate-500">
                            End
                            <input
                              type="time"
                              value={day.end_time}
                              onChange={(e) => handleAvailabilityChange(day.day_of_week, 'end_time', e.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-800 bg-[#151b2c] px-2 py-1.5 text-xs text-white"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={savingAvailability}
                  className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAvailability ? 'Saving Schedule...' : 'Save Availability'}
                </button>
              </form>

              <section className="schedule-center-lookup order-1 rounded-2xl border border-slate-800 bg-[#111827] p-5 shadow-xl">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200">
                  <Search className="h-4 w-4 text-emerald-400" />
                  Walk-in Patient Lookup
                </h3>
                <div className="relative max-w-xl">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Lookup NIC, name, or university ID..."
                    className="w-full rounded-xl border border-slate-800 bg-[#0b0f19] px-4 py-3 text-xs text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {showSearchDropdown && searchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-[#151c2c] p-1.5 shadow-2xl">
                      {searchResults.map((patient) => (
                        <button
                          key={patient.id}
                          type="button"
                          onClick={() => handleSelectPatient(patient.id)}
                          className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left text-xs transition hover:bg-slate-800"
                        >
                          <span className="font-semibold text-white">{patient.name}</span>
                          <span className="text-[10px] text-slate-500">{getPatientDisplayId(patient)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="schedule-center-appointments order-2 rounded-2xl border border-slate-800 bg-[#111827] p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200">
                    <Calendar className="h-4 w-4 text-emerald-400" />
                    Scheduled Today
                  </h3>
                  <span className="rounded-full bg-[#0b0f19] px-2.5 py-1 text-[10px] font-bold text-slate-400">{appointments.length}</span>
                </div>
                {appointments.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {appointments.map((appt) => {
                      const patientUser = appt.patient.user;
                      const hasTimeConflict = conflictingAppointmentIds.has(appt.id);
                      return (
                        <button
                          key={appt.id}
                          type="button"
                          onClick={() => handleSelectPatient(appt.patient_id, appt.id)}
                          className={`rounded-xl border p-4 text-left transition-colors ${hasTimeConflict ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15' : 'border-slate-800 bg-[#151b2c] hover:border-emerald-500/30 hover:bg-slate-800'}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-xs font-bold text-white">{patientUser.name}</span>
                            <span className="shrink-0 text-[10px] font-bold text-emerald-400">{new Date(appt.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="mt-2 truncate text-[10px] text-slate-500">{appt.reason}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-10 text-center text-xs text-slate-500">No appointments scheduled today.</p>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
      
      <CertificateDrawer
        isOpen={isCertDrawerOpen && activeWorkspace === 'certificates'}
        inline
        onPendingCountChange={setPendingCertificateCount}
        onClose={() => {
          setIsCertDrawerOpen(false);
          setActiveWorkspace('schedule');
        }}
        onProcessed={() => {
          if (selectedPatientId) {
            handleSelectPatient(selectedPatientId, selectedAppointmentId || undefined);
          }
        }}
      />
    </div>
  );
}
