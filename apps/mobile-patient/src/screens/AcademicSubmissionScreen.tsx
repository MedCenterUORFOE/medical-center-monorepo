import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── TypeScript Data Interfaces ──
export interface PatientConsultationRecord {
  id: string;
  doctor_id: string;
  doctor_name: string;
  visit_date_time: string;
  diagnosis: string;
  symptoms?: string | null;
  treatment_plan?: string | null;
}

export interface Lecturer {
  id: string; // Maps to AcademicStaff.academic_staff_id (User.id)
  name: string;
  email: string;
  department: string;
  faculty?: string;
  position: string;
  university_staff_id?: string;
  is_active?: boolean;
}

export interface StoredCertificateRecipient {
  staffId: string;
  name: string;
  email: string;
  department: string;
  sentAt?: string | null;
}

export interface StoredCertificateRequest {
  requestId: string;
  recordId: string;
  doctorId: string;
  doctorName: string;
  visitDate: string;
  diagnosis: string;
  symptoms?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  updatedAt?: string;
  certificateFileUrl: string; // `certificates/${requestId}.pdf`
  doctorNotes?: string | null;
  signedUrl?: string | null;
  hasGeneratedPdf?: boolean;
  recipients?: StoredCertificateRecipient[];
}

interface ServerNotificationItem {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  sent_at: string;
}

export const INITIAL_LECTURERS: Lecturer[] = [
  {
    id: '25455df3-75e7-419b-a17c-75cfa57017ea',
    name: 'Prof. Kamani Perera',
    email: 'ruhuna.medcenter.team@gmail.com',
    department: 'Electrical and Information Engineering',
    faculty: 'Faculty of Engineering',
    position: 'Senior Lecturer',
    university_staff_id: 'ACAD-ENG-078',
    is_active: true,
  },
  {
    id: 'c562da59-5191-499d-805b-4b9e5397c3a9',
    name: 'Dr. Kavindu M.M.M',
    email: 'kavidud@gmail.com',
    department: 'Electrical and Information Engineering (DEIE)',
    faculty: 'Faculty of Engineering',
    position: 'Senior Lecturer',
    university_staff_id: 'SB1234',
    is_active: true,
  },
  {
    id: '80c0373f-ded5-43ff-8a1a-df87ef45d280',
    name: 'Dr. Jayasekara',
    email: 'gamma@gmail.com',
    department: 'Electrical and Information Engineering (DEIE)',
    faculty: 'Faculty of Engineering',
    position: 'Visiting Lecturer',
    university_staff_id: 'ACAD-DEIE-012',
    is_active: true,
  },
  {
    id: '4ec592aa-acd5-47cf-811b-96b06628477f',
    name: 'Dr. Wickramasingha',
    email: 'sorry@gmail.com',
    department: 'Electrical and Information Engineering (DEIE)',
    faculty: 'Faculty of Engineering',
    position: 'Senior Lecturer',
    university_staff_id: 'ACAD-DEIE-019',
    is_active: true,
  },
  {
    id: '8192dcea-a3bc-4471-853b-e8ef59310369',
    name: 'Dr. A.B. Chandrasiri',
    email: 'abc@gmail.com',
    department: 'Mechanical and Manufacturing Engineering (DMME)',
    faculty: 'Faculty of Engineering',
    position: 'Senior Lecturer',
    university_staff_id: 'ACAD-DMME-005',
    is_active: true,
  },
  {
    id: '39e93b05-480e-4d3a-816b-caa740535a06',
    name: 'Dr. Jonathon Silva',
    email: 'jon@gmail.com',
    department: 'Civil and Environmental Engineering (DCEE)',
    faculty: 'Faculty of Engineering',
    position: 'Senior Lecturer',
    university_staff_id: 'ACAD-DCEE-044',
    is_active: true,
  },
  {
    id: '9456d3c1-24ae-42ed-a7df-fca5d0f21cdd',
    name: 'Dr. Hasitha Ranasinghe',
    email: 'has@gmail.com',
    department: 'Computer Science & Engineering',
    faculty: 'Faculty of Engineering',
    position: 'Senior Lecturer',
    university_staff_id: 'ACAD-ENG-091',
    is_active: true,
  },
];

export const isValidActiveLecturer = (l: any): boolean => {
  if (!l || typeof l !== 'object') return false;
  const id = l.id || l.academic_staff_id;
  if (!id || typeof id !== 'string') return false;
  const rawName = (l.name || l.user?.name || '').trim();
  if (!rawName) return false;
  const norm = rawName.toLowerCase().replace(/^(prof\.?|dr\.?|doctor|mr\.?|ms\.?|mrs\.?)\s+/i, '').trim();
  const invalid = ['deleted user', 'deleted', 'unknown', 'inactive', 'suspended'];
  if (invalid.includes(norm) || norm.startsWith('deleted')) return false;
  const email = (l.email || l.user?.email || '').trim().toLowerCase();
  if (email.startsWith('deleted') || email.includes('@anonymized.local')) return false;
  if (l.is_deleted === true || l.status === 'SUSPENDED' || l.status === 'DELETED') return false;
  return true;
};

const formatDate = (dateString?: string | null): string => {
  if (!dateString) return 'Date unavailable';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (dateString?: string | null): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function AcademicSubmissionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recordId?: string; tab?: string; requestId?: string }>();

  // Active Tab: 'REQUEST' vs 'MY_REQUESTS'
  const [activeTab, setActiveTab] = useState<'REQUEST' | 'MY_REQUESTS'>(
    params.tab === 'certificates' || params.tab === 'my-requests' ? 'MY_REQUESTS' : 'REQUEST'
  );

  // Patient Records State
  const [records, setRecords] = useState<PatientConsultationRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PatientConsultationRecord | null>(null);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lecturers Directory State
  const [lecturersList, setLecturersList] = useState<Lecturer[]>(
    INITIAL_LECTURERS.filter(isValidActiveLecturer)
  );

  // Request Tab: Multi-Lecturer Selection State
  const [selectedLecturerIds, setSelectedLecturerIds] = useState<string[]>([]);
  const [lecturerSearchQuery, setLecturerSearchQuery] = useState('');

  // Stored Requests & Sync State
  const [storedRequests, setStoredRequests] = useState<StoredCertificateRequest[]>([]);
  const [activeNotifBanner, setActiveNotifBanner] = useState<ServerNotificationItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Dedicated Certificate Action States
  const [viewingCertId, setViewingCertId] = useState<string | null>(null);
  const [downloadingCertId, setDownloadingCertId] = useState<string | null>(null);

  // My Certificates: Date Filtering State
  type DateFilterMode = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM';
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('ALL');
  const [customFilterDate, setCustomFilterDate] = useState<Date | null>(null);
  const [showFilterDatePicker, setShowFilterDatePicker] = useState(false);

  // "Send to Forgotten Lecturer" Modal State
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [forwardingRequest, setForwardingRequest] = useState<StoredCertificateRequest | null>(null);
  const [forwardLecturerSearchQuery, setForwardLecturerSearchQuery] = useState('');
  const [selectedForwardLecturerIds, setSelectedForwardLecturerIds] = useState<string[]>([]);
  const [isSendingToLecturers, setIsSendingToLecturers] = useState(false);

  // Switch tab if parameter requested it
  useEffect(() => {
    if (params.tab === 'certificates' || params.tab === 'my-requests') {
      setActiveTab('MY_REQUESTS');
    }
  }, [params.tab]);

  // Auth helper
  const getAuthCredentials = useCallback(async () => {
    const token =
      (await AsyncStorage.getItem('userToken')) || (await SecureStore.getItemAsync('userToken'));
    const userId =
      (await AsyncStorage.getItem('userId')) || (await SecureStore.getItemAsync('userId'));
    const userName =
      (await AsyncStorage.getItem('userName')) || (await SecureStore.getItemAsync('userName'));
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    return { token, userId, userName, apiUrl };
  }, []);

  // ── 1. Load Local Requests from AsyncStorage ──
  const loadStoredRequests = useCallback(async () => {
    try {
      const { userId } = await getAuthCredentials();
      if (!userId) return [];
      const storageKey = `patient_certificate_requests_${userId}`;
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) {
        const parsed: StoredCertificateRequest[] = JSON.parse(raw);
        setStoredRequests(parsed);
        return parsed;
      }
      setStoredRequests([]);
      return [];
    } catch (err) {
      console.warn('Error reading stored certificate requests:', err);
      return [];
    }
  }, [getAuthCredentials]);

  // Save Requests to AsyncStorage
  const saveStoredRequests = useCallback(
    async (updated: StoredCertificateRequest[]) => {
      try {
        const { userId } = await getAuthCredentials();
        if (!userId) return;
        const storageKey = `patient_certificate_requests_${userId}`;
        await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
        setStoredRequests(updated);
      } catch (err) {
        console.warn('Error saving certificate requests to storage:', err);
      }
    },
    [getAuthCredentials]
  );

  // ── 2. Fetch Consultation Records from Backend ──
  const fetchConsultationRecords = useCallback(async () => {
    setIsLoadingRecords(true);
    try {
      const { token, userId, apiUrl } = await getAuthCredentials();
      if (!token || !userId || !apiUrl) {
        throw new Error('Authentication session or API URL is missing.');
      }

      const response = await fetch(`${apiUrl}/api/records/history/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Cookie: `session_token=${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load medical history (${response.status})`);
      }

      const payload = await response.json();
      const rawHistory: any[] = payload?.data?.history || payload?.history || [];

      const parsed: PatientConsultationRecord[] = rawHistory.map((item: any) => ({
        id: String(item.id),
        doctor_id: String(item.doctor_id || item.doctor?.doctor_id || ''),
        doctor_name:
          item.doctor_name ||
          item.doctor?.staff?.user?.name ||
          item.doctor?.name ||
          'Attending Medical Officer',
        visit_date_time: item.visit_date_time || item.visit_date || item.created_at || new Date().toISOString(),
        diagnosis: item.diagnosis?.trim() || 'Clinical Consultation',
        symptoms: item.symptoms?.trim() || null,
        treatment_plan: item.treatment_plan?.trim() || null,
      }));

      setRecords(parsed);

      // Auto-select record if preselected via route params
      if (params.recordId) {
        const target = parsed.find((r) => r.id === params.recordId);
        if (target) {
          setSelectedRecord(target);
        }
      }
    } catch (err: any) {
      console.error('Fetch Consultation Records Error:', err);
      Alert.alert(
        'Unable to Load Records',
        err.message || 'Please check your internet connection and try again.'
      );
    } finally {
      setIsLoadingRecords(false);
    }
  }, [getAuthCredentials, params.recordId]);

  // ── 3. Synchronize Stored Requests with Backend Notifications & Signed URLs ──
  const syncWithNotificationsAndStorage = useCallback(async () => {
    try {
      const { token, apiUrl } = await getAuthCredentials();
      if (!token || !apiUrl) return;

      const currentStored = await loadStoredRequests();
      if (currentStored.length === 0) return;

      // Fetch server notifications
      const notifRes = await fetch(`${apiUrl}/api/notifications`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Cookie: `session_token=${token}`,
        },
      });

      let updatedList = [...currentStored];
      let hasChanges = false;

      if (notifRes.ok) {
        const notifPayload = await notifRes.json();
        const serverNotifs: ServerNotificationItem[] =
          notifPayload?.data?.notifications || notifPayload?.notifications || [];

        // Check for active unread certificate notifications to show at the top banner
        const unreadCertNotif = serverNotifs.find(
          (n) => !n.is_read && (n.type === 'CERTIFICATE_APPROVED' || n.type === 'CERTIFICATE_REJECTED')
        );
        setActiveNotifBanner(unreadCertNotif || null);

        // Map notifications to stored requests
        serverNotifs.forEach((n) => {
          if (n.type === 'CERTIFICATE_APPROVED') {
            updatedList = updatedList.map((item) => {
              if (item.status === 'PENDING') {
                hasChanges = true;
                return {
                  ...item,
                  status: 'APPROVED',
                  updatedAt: n.sent_at,
                };
              }
              return item;
            });
          } else if (n.type === 'CERTIFICATE_REJECTED') {
            updatedList = updatedList.map((item) => {
              if (item.status === 'PENDING') {
                hasChanges = true;
                return {
                  ...item,
                  status: 'REJECTED',
                  updatedAt: n.sent_at,
                  doctorNotes: n.message,
                };
              }
              return item;
            });
          }
        });
      }

      // Probe signed URL for PENDING or APPROVED requests to detect if Doctor has generated the PDF
      for (const item of updatedList) {
        if (item.status === 'PENDING' || item.status === 'APPROVED') {
          try {
            const probeRes = await fetch(
              `${apiUrl}/api/documents/sign-url?file_path=${encodeURIComponent(item.certificateFileUrl)}`,
              {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                  Cookie: `session_token=${token}`,
                },
              }
            );
            if (probeRes.ok) {
              const probeJson = await probeRes.json().catch(() => null);
              const signed = probeJson?.data?.signed_url || probeJson?.signed_url;
              if (signed) {
                item.status = 'APPROVED';
                item.signedUrl = signed;
                item.hasGeneratedPdf = true;
                item.updatedAt = new Date().toISOString();
                hasChanges = true;
              }
            } else if (probeRes.status === 404 && item.status === 'APPROVED') {
              if (item.hasGeneratedPdf !== false || item.signedUrl) {
                item.hasGeneratedPdf = false;
                item.signedUrl = null;
                hasChanges = true;
              }
            }
          } catch {
            // Ignore probe errors during sync
          }
        }
      }

      if (hasChanges) {
        await saveStoredRequests(updatedList);
      }
    } catch (err) {
      console.warn('Sync notifications error:', err);
    }
  }, [getAuthCredentials, loadStoredRequests, saveStoredRequests]);

  // Initial Load & Focus
  useEffect(() => {
    void fetchConsultationRecords();
    void syncWithNotificationsAndStorage();
  }, [fetchConsultationRecords, syncWithNotificationsAndStorage]);

  // Pull-to-refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchConsultationRecords(), syncWithNotificationsAndStorage()]);
    setIsRefreshing(false);
  };

  // Map of recordId -> StoredCertificateRequest for fast lookup
  const recordRequestMap = useMemo(() => {
    const map = new Map<string, StoredCertificateRequest>();
    storedRequests.forEach((req) => {
      map.set(req.recordId, req);
    });
    return map;
  }, [storedRequests]);

  // Filtered lecturers for the Request Certificate tab
  const filteredRequestLecturers = useMemo(() => {
    const q = lecturerSearchQuery.trim().toLowerCase();
    if (!q) return lecturersList;
    return lecturersList.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.department.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.position && l.position.toLowerCase().includes(q)) ||
        (l.university_staff_id && l.university_staff_id.toLowerCase().includes(q))
    );
  }, [lecturersList, lecturerSearchQuery]);

  // Toggle selection of a lecturer in Request tab
  const handleToggleLecturer = (id: string) => {
    setSelectedLecturerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Remove a selected lecturer chip
  const handleRemoveLecturer = (id: string) => {
    setSelectedLecturerIds((prev) => prev.filter((item) => item !== id));
  };

  // ── 4. Submit Medical Certificate Request (`POST /api/certificates/request`) ──
  const handleSubmitCertificateRequest = async () => {
    if (!selectedRecord) {
      Alert.alert('Selection Required', 'Please select a clinical consultation visit to request a certificate for.');
      return;
    }

    // Check duplicate locally
    const existing = recordRequestMap.get(selectedRecord.id);
    if (existing) {
      Alert.alert(
        'Already Requested',
        `A medical certificate request for this visit on ${formatDate(selectedRecord.visit_date_time)} (${selectedRecord.diagnosis}) has already been submitted and is currently marked as ${existing.status}.`
      );
      setActiveTab('MY_REQUESTS');
      return;
    }

    setIsSubmitting(true);
    try {
      const { token, apiUrl } = await getAuthCredentials();
      if (!token || !apiUrl) {
        throw new Error('Authentication expired. Please sign in again.');
      }

      // Backend payload schema: { record_id, doctor_id, recipient_staff_ids }
      const payload = {
        record_id: selectedRecord.id,
        doctor_id: selectedRecord.doctor_id,
        recipient_staff_ids: selectedLecturerIds,
      };

      const response = await fetch(`${apiUrl}/api/certificates/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Cookie: `session_token=${token}`,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json().catch(() => null);

      if (response.status === 201) {
        const requestId = responseData?.data?.request_id || responseData?.request_id || `req-${Date.now()}`;

        // Map tagged lecturers for local storage display
        const taggedRecipients: StoredCertificateRecipient[] = [];
        selectedLecturerIds.forEach((id) => {
          const match = lecturersList.find((l) => l.id === id);
          if (match) {
            taggedRecipients.push({
              staffId: match.id,
              name: match.name,
              email: match.email,
              department: match.department,
              sentAt: null,
            });
          }
        });

        const newEntry: StoredCertificateRequest = {
          requestId,
          recordId: selectedRecord.id,
          doctorId: selectedRecord.doctor_id,
          doctorName: selectedRecord.doctor_name,
          visitDate: selectedRecord.visit_date_time,
          diagnosis: selectedRecord.diagnosis,
          symptoms: selectedRecord.symptoms,
          status: 'PENDING',
          requestedAt: new Date().toISOString(),
          certificateFileUrl: `certificates/${requestId}.pdf`,
          recipients: taggedRecipients,
        };

        const updatedRequests = [newEntry, ...storedRequests];
        await saveStoredRequests(updatedRequests);

        const lecturerMsg =
          taggedRecipients.length > 0
            ? `\n\nTagged ${taggedRecipients.length} lecturer(s) for automatic email dispatch upon approval.`
            : '';

        Alert.alert(
          'Request Submitted',
          `Your medical certificate request has been dispatched to Dr. ${selectedRecord.doctor_name}.${lecturerMsg}`,
          [
            {
              text: 'View Status',
              onPress: () => {
                setActiveTab('MY_REQUESTS');
                setSelectedRecord(null);
                setSelectedLecturerIds([]);
              },
            },
          ]
        );
      } else if (response.status === 409) {
        Alert.alert(
          'Already Requested',
          'A medical certificate has already been requested for this consultation visit on the server.',
          [
            {
              text: 'View My Requests',
              onPress: () => setActiveTab('MY_REQUESTS'),
            },
          ]
        );
      } else {
        const message = responseData?.message || responseData?.error || 'Unable to submit certificate request.';
        throw new Error(message);
      }
    } catch (err: any) {
      console.error('Submit Certificate Request Error:', err);
      Alert.alert('Submission Failed', err.message || 'Please check your network connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── 5. Check Single Status Probe (Manual Button) ──
  const handleCheckStatus = async (item: StoredCertificateRequest) => {
    setActionInProgressId(item.requestId);
    try {
      const { token, apiUrl } = await getAuthCredentials();
      if (!token || !apiUrl) throw new Error('Not authenticated.');

      // 1. Probe signed URL to see if the doctor has generated the PDF in Supabase
      const probeRes = await fetch(
        `${apiUrl}/api/documents/sign-url?file_path=${encodeURIComponent(item.certificateFileUrl)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Cookie: `session_token=${token}`,
          },
        }
      );

      if (probeRes.ok) {
        const probeJson = await probeRes.json().catch(() => null);
        const signed = probeJson?.data?.signed_url || probeJson?.signed_url;
        if (signed) {
          const updated = storedRequests.map((r) =>
            r.requestId === item.requestId
              ? {
                  ...r,
                  status: 'APPROVED' as const,
                  signedUrl: signed,
                  hasGeneratedPdf: true,
                  updatedAt: new Date().toISOString(),
                }
              : r
          );
          await saveStoredRequests(updated);
          Alert.alert(
            'Medical Certificate Ready!',
            `Dr. ${item.doctorName} has generated your official medical certificate PDF. It is now ready to view and download.`
          );
          return;
        }
      }

      // 2. If 404 or not yet signed, refresh notifications and sync
      await syncWithNotificationsAndStorage();
      const freshStored = await loadStoredRequests();
      const freshItem = freshStored.find((r) => r.requestId === item.requestId) || item;

      if (freshItem.status === 'APPROVED') {
        if (freshItem.hasGeneratedPdf && freshItem.signedUrl) {
          Alert.alert(
            'Medical Certificate Ready!',
            'Your medical certificate has been generated and is ready to view or download.'
          );
        } else {
          Alert.alert(
            'Approved — Waiting for PDF Generation',
            `Dr. ${freshItem.doctorName} has approved your medical certificate request.\n\nThe doctor or clinic has not clicked "Generate" on the web portal yet. Please tap "Check for Generated PDF" again once generated.`
          );
        }
      } else if (freshItem.status === 'REJECTED') {
        Alert.alert(
          'Request Rejected',
          freshItem.doctorNotes
            ? `Doctor Remarks: ${freshItem.doctorNotes}`
            : 'Your certificate request was not approved by the doctor.'
        );
      } else {
        Alert.alert(
          'Request Pending',
          `Your certificate request is currently awaiting review by Dr. ${freshItem.doctorName}.`
        );
      }
    } catch (err: any) {
      Alert.alert('Status Check Failed', err.message || 'Please try again later.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // ── 6. View Doctor-Generated Certificate PDF in Browser / Device Viewer ──
  const handleViewCertificate = async (item: StoredCertificateRequest) => {
    setViewingCertId(item.requestId);
    try {
      const { token, apiUrl } = await getAuthCredentials();
      if (!token || !apiUrl) throw new Error('Not authenticated.');

      // Probe backend for a fresh 5-minute signed URL
      let signedUrl = item.signedUrl;
      const signRes = await fetch(
        `${apiUrl}/api/documents/sign-url?file_path=${encodeURIComponent(item.certificateFileUrl)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Cookie: `session_token=${token}`,
          },
        }
      );

      if (signRes.ok) {
        const signJson = await signRes.json().catch(() => null);
        signedUrl = signJson?.data?.signed_url || signJson?.signed_url || null;
        if (signedUrl) {
          const updated = storedRequests.map((r) =>
            r.requestId === item.requestId
              ? { ...r, status: 'APPROVED' as const, signedUrl, hasGeneratedPdf: true }
              : r
          );
          await saveStoredRequests(updated);
        }
      } else if (signRes.status === 404) {
        const updated = storedRequests.map((r) =>
          r.requestId === item.requestId ? { ...r, hasGeneratedPdf: false, signedUrl: null } : r
        );
        await saveStoredRequests(updated);
        Alert.alert(
          'PDF Not Ready Yet',
          `Dr. ${item.doctorName} has approved your request, but has not clicked "Generate" on the web portal yet.\n\nPlease check back shortly or tap "Check for Generated PDF".`
        );
        return;
      }

      if (!signedUrl) {
        throw new Error('Unable to obtain secure document view link from server.');
      }

      // Open the doctor-generated official PDF directly
      await Linking.openURL(signedUrl);
    } catch (err: any) {
      console.error('View Certificate Error:', err);
      Alert.alert(
        'Unable to Open Certificate',
        err?.message || 'Could not load official certificate. Please check your connection.'
      );
    } finally {
      setViewingCertId(null);
    }
  };

  // ── 7. Download & Save Real Doctor-Generated PDF to Device ──
  const handleDownloadCertificate = async (item: StoredCertificateRequest) => {
    setDownloadingCertId(item.requestId);
    try {
      const { token, apiUrl } = await getAuthCredentials();
      if (!token || !apiUrl) throw new Error('Not authenticated.');

      // Probe backend for a fresh signed URL
      let downloadUrl = item.signedUrl;
      const signRes = await fetch(
        `${apiUrl}/api/documents/sign-url?file_path=${encodeURIComponent(item.certificateFileUrl)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Cookie: `session_token=${token}`,
          },
        }
      );

      if (signRes.ok) {
        const signJson = await signRes.json().catch(() => null);
        downloadUrl = signJson?.data?.signed_url || signJson?.signed_url || null;
      } else if (signRes.status === 404) {
        Alert.alert(
          'PDF Not Ready Yet',
          `Dr. ${item.doctorName} has approved your request, but has not clicked "Generate" on the web portal yet.\n\nPlease check back shortly or tap "Check for Generated PDF".`
        );
        return;
      }

      if (!downloadUrl) {
        throw new Error('Doctor has not generated the certificate PDF yet.');
      }

      const cleanFileName = `Medical_Certificate_${item.requestId.slice(0, 8)}.pdf`;
      const tempLocalPath = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}${cleanFileName}`;

      const dlResult = await FileSystem.downloadAsync(downloadUrl, tempLocalPath);
      if (dlResult.status !== 200) {
        throw new Error(`Failed to download certificate from server (HTTP ${dlResult.status}).`);
      }

      const base64Data = await FileSystem.readAsStringAsync(dlResult.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Save real file to phone storage
      if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
        try {
          const permissions =
            await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
              permissions.directoryUri,
              cleanFileName,
              'application/pdf'
            );
            await FileSystem.writeAsStringAsync(destUri, base64Data, {
              encoding: FileSystem.EncodingType.Base64,
            });
            Alert.alert(
              'Download Complete',
              `Your official medical certificate "${cleanFileName}" has been saved to your device.`
            );
            return;
          } else {
            await Linking.openURL(downloadUrl);
            return;
          }
        } catch (safErr) {
          console.warn('StorageAccessFramework error, falling back to share sheet:', safErr);
        }
      }

      // Fallback for iOS or if SAF was bypassed
      if (Platform.OS === 'ios') {
        await Share.share({
          title: cleanFileName,
          url: tempLocalPath,
        });
      } else {
        await Share.share({
          title: cleanFileName,
          url: tempLocalPath,
          message: `Official Medical Certificate: ${cleanFileName}`,
        });
        Alert.alert(
          'Certificate Saved',
          `Your official medical certificate was saved to your device: ${cleanFileName}`
        );
      }
    } catch (err: any) {
      console.error('Download certificate error:', err);
      Alert.alert(
        'Download Error',
        err?.message || 'Unable to download certificate. Please try again.'
      );
    } finally {
      setDownloadingCertId(null);
    }
  };

  // ── 8. Dismiss / Mark Read Notification Banner ──
  const handleDismissNotification = async (notifId: string) => {
    try {
      const { token, apiUrl } = await getAuthCredentials();
      if (!token || !apiUrl) return;

      await fetch(`${apiUrl}/api/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Cookie: `session_token=${token}`,
        },
      });

      setActiveNotifBanner(null);
    } catch {
      setActiveNotifBanner(null);
    }
  };

  // ── 9. Date Filtering Logic for "My Certificates" ──
  const filteredStoredRequests = useMemo(() => {
    if (dateFilterMode === 'ALL') return storedRequests;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return storedRequests.filter((req) => {
      const reqDate = new Date(req.visitDate || req.requestedAt);
      if (isNaN(reqDate.getTime())) return true;

      if (dateFilterMode === 'TODAY') {
        const reqDay = new Date(reqDate.getFullYear(), reqDate.getMonth(), reqDate.getDate());
        return reqDay.getTime() === startOfToday.getTime();
      }
      if (dateFilterMode === 'LAST_7_DAYS') {
        const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
        return reqDate >= sevenDaysAgo;
      }
      if (dateFilterMode === 'THIS_MONTH') {
        return (
          reqDate.getFullYear() === now.getFullYear() &&
          reqDate.getMonth() === now.getMonth()
        );
      }
      if (dateFilterMode === 'CUSTOM' && customFilterDate) {
        return (
          reqDate.getFullYear() === customFilterDate.getFullYear() &&
          reqDate.getMonth() === customFilterDate.getMonth() &&
          reqDate.getDate() === customFilterDate.getDate()
        );
      }
      return true;
    });
  }, [storedRequests, dateFilterMode, customFilterDate]);

  // ── 10. "Send to Forgotten Lecturer" Modal Logic ──
  const handleOpenForwardModal = (item: StoredCertificateRequest) => {
    setForwardingRequest(item);
    setForwardLecturerSearchQuery('');
    setSelectedForwardLecturerIds([]);
    setForwardModalVisible(true);
  };

  const handleCloseForwardModal = () => {
    setForwardModalVisible(false);
    setForwardingRequest(null);
    setSelectedForwardLecturerIds([]);
  };

  // Filtered lecturers in the forward modal
  const filteredForwardLecturers = useMemo(() => {
    const q = forwardLecturerSearchQuery.trim().toLowerCase();
    if (!q) return lecturersList;
    return lecturersList.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.department.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.position && l.position.toLowerCase().includes(q))
    );
  }, [lecturersList, forwardLecturerSearchQuery]);

  const handleToggleForwardLecturer = (id: string) => {
    setSelectedForwardLecturerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Send approved certificate to additional/forgotten lecturers
  const handleSendCertificateToLecturers = async () => {
    if (!forwardingRequest) return;
    if (selectedForwardLecturerIds.length === 0) {
      Alert.alert('Selection Required', 'Please select at least one lecturer to forward this certificate to.');
      return;
    }

    setIsSendingToLecturers(true);
    try {
      const { token, apiUrl, userName } = await getAuthCredentials();
      if (!token || !apiUrl) throw new Error('Not authenticated.');

      // Obtain fresh signed URL
      let certUrl = forwardingRequest.signedUrl;
      const signRes = await fetch(
        `${apiUrl}/api/documents/sign-url?file_path=${encodeURIComponent(forwardingRequest.certificateFileUrl)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Cookie: `session_token=${token}`,
          },
        }
      );

      if (signRes.ok) {
        const signJson = await signRes.json().catch(() => null);
        certUrl = signJson?.data?.signed_url || signJson?.signed_url || certUrl;
      }

      if (!certUrl) {
        throw new Error('Doctor has not generated the certificate PDF yet.');
      }

      // Selected lecturers details
      const selectedLecturers = selectedForwardLecturerIds
        .map((id) => lecturersList.find((l) => l.id === id))
        .filter((l): l is Lecturer => Boolean(l));

      const targetEmails = selectedLecturers.map((l) => l.email);
      const studentName = userName || 'Student';

      // Build Mailto & Share Intent
      const subject = encodeURIComponent(
        `Medical Leave Certificate: ${studentName} - Clinical Visit (${formatDate(forwardingRequest.visitDate)})`
      );
      const body = encodeURIComponent(
        `Dear Lecturer / Academic Staff Member,\n\n` +
          `Please find my authorized medical leave certificate for my clinical visit at the University Medical Center.\n\n` +
          `• Student Name: ${studentName}\n` +
          `• Consultation Visit: ${formatDate(forwardingRequest.visitDate)}\n` +
          `• Attending Medical Officer: Dr. ${forwardingRequest.doctorName}\n` +
          `• Clinical Diagnosis: ${forwardingRequest.diagnosis}\n\n` +
          `Official Verified Certificate Document Link:\n${certUrl}\n\n` +
          `Thank you,\n${studentName}`
      );

      const mailtoUrl = `mailto:${targetEmails.join(',')}?subject=${subject}&body=${body}`;

      // Update StoredCertificateRequest recipients list
      const nowIso = new Date().toISOString();
      const existingRecipients = forwardingRequest.recipients || [];
      const newRecipients: StoredCertificateRecipient[] = selectedLecturers.map((l) => ({
        staffId: l.id,
        name: l.name,
        email: l.email,
        department: l.department,
        sentAt: nowIso,
      }));

      // Merge avoiding duplicate staffId
      const mergedRecipients = [...existingRecipients];
      newRecipients.forEach((nr) => {
        const idx = mergedRecipients.findIndex((r) => r.staffId === nr.staffId);
        if (idx >= 0) {
          mergedRecipients[idx] = nr;
        } else {
          mergedRecipients.push(nr);
        }
      });

      const updatedStored = storedRequests.map((r) =>
        r.requestId === forwardingRequest.requestId
          ? { ...r, recipients: mergedRecipients, updatedAt: nowIso }
          : r
      );

      await saveStoredRequests(updatedStored);

      handleCloseForwardModal();

      // Launch email dispatch prompt
      Alert.alert(
        'Dispatch Certificate to Lecturers',
        `Send official Medical Certificate PDF to ${selectedLecturers.map((l) => l.name).join(', ')}?`,
        [
          {
            text: 'Send via Email App',
            onPress: async () => {
              const supported = await Linking.canOpenURL(mailtoUrl);
              if (supported) {
                await Linking.openURL(mailtoUrl);
              } else {
                await Share.share({
                  title: `Medical Certificate: ${studentName}`,
                  message: `Medical Leave Certificate for ${studentName}:\n${certUrl}`,
                });
              }
            },
          },
          {
            text: 'Share Link Directly',
            onPress: async () => {
              await Share.share({
                title: `Medical Certificate: ${studentName}`,
                message: `Authorized Medical Leave Certificate for ${studentName} (${formatDate(
                  forwardingRequest.visitDate
                )}):\n${certUrl}`,
              });
            },
          },
          { text: 'Done', style: 'cancel' },
        ]
      );
    } catch (err: any) {
      console.error('Send Certificate Error:', err);
      Alert.alert('Send Failed', err?.message || 'Unable to dispatch certificate to lecturers.');
    } finally {
      setIsSendingToLecturers(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#D5E6DC" />

      {/* HEADER BANNER */}
      <View style={styles.headerBanner}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#16211C" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerEyebrow}>Medical Center</Text>
            <Text style={styles.headerTitle}>Medical Certificates</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshHeaderBtn}
            onPress={handleRefresh}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="refresh" size={20} color="#3B6E5C" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>
          Request, tag lecturers, and forward official doctor-approved medical certificates.
        </Text>

        {/* TAB SWITCHER */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'REQUEST' && styles.tabButtonActive]}
            onPress={() => setActiveTab('REQUEST')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name="file-document-edit-outline"
              size={18}
              color={activeTab === 'REQUEST' ? '#FFFFFF' : '#3B6E5C'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabButtonText, activeTab === 'REQUEST' && styles.tabButtonTextActive]}>
              Request Certificate
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'MY_REQUESTS' && styles.tabButtonActive]}
            onPress={() => setActiveTab('MY_REQUESTS')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name="certificate-outline"
              size={18}
              color={activeTab === 'MY_REQUESTS' ? '#FFFFFF' : '#3B6E5C'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabButtonText, activeTab === 'MY_REQUESTS' && styles.tabButtonTextActive]}>
              My Certificates
            </Text>
            {storedRequests.length > 0 && (
              <View
                style={[
                  styles.tabBadge,
                  activeTab === 'MY_REQUESTS' ? styles.tabBadgeActive : styles.tabBadgeInactive,
                ]}
              >
                <Text
                  style={[
                    styles.tabBadgeText,
                    activeTab === 'MY_REQUESTS' ? styles.tabBadgeTextActive : styles.tabBadgeTextInactive,
                  ]}
                >
                  {storedRequests.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#3B6E5C"
            colors={['#3B6E5C']}
          />
        }
      >
        {/* ==================================================================== */}
        {/* TAB 1: REQUEST MEDICAL CERTIFICATE                                   */}
        {/* ==================================================================== */}
        {activeTab === 'REQUEST' && (
          <View style={styles.tabContent}>
            {/* SUBTLE HINT */}
            <View style={styles.subtleHintRow}>
              <Ionicons name="information-circle-outline" size={15} color="#3B6E5C" style={{ marginRight: 6 }} />
              <Text style={styles.subtleHintText}>
                Select a consultation visit below and optionally tag lecturers to receive your certificate.
              </Text>
            </View>

            {/* SECTION HEADING */}
            <View style={styles.sectionHeadingRow}>
              <Ionicons name="calendar-outline" size={18} color="#3B6E5C" style={{ marginRight: 6 }} />
              <Text style={styles.sectionHeading}>Select Consultation Record</Text>
            </View>

            {isLoadingRecords ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="large" color="#3B6E5C" />
                <Text style={styles.loaderText}>Loading consultation records...</Text>
              </View>
            ) : records.length === 0 ? (
              <View style={styles.emptyStateCard}>
                <MaterialCommunityIcons name="clipboard-text-off-outline" size={44} color="#72857B" />
                <Text style={styles.emptyStateTitle}>No Consultation Visits Found</Text>
                <Text style={styles.emptyStateBody}>
                  You need at least one completed medical consultation with a university doctor before you can
                  request a medical certificate.
                </Text>
              </View>
            ) : (
              <View style={styles.recordsList}>
                {records.map((rec) => {
                  const isSelected = selectedRecord?.id === rec.id;
                  const existingReq = recordRequestMap.get(rec.id);
                  const isRequested = !!existingReq;

                  return (
                    <TouchableOpacity
                      key={rec.id}
                      style={[
                        styles.recordCard,
                        isSelected && styles.recordCardSelected,
                        isRequested && styles.recordCardRequested,
                      ]}
                      onPress={() => {
                        if (isRequested) {
                          Alert.alert(
                            'Request Already Active',
                            `A certificate has already been requested for this visit. Current status: ${existingReq.status}.`,
                            [
                              { text: 'View Requests', onPress: () => setActiveTab('MY_REQUESTS') },
                              { text: 'Cancel' },
                            ]
                          );
                          return;
                        }
                        setSelectedRecord(rec);
                      }}
                      activeOpacity={0.85}
                    >
                      {/* Top Row: Doctor info & Status tag if already requested */}
                      <View style={styles.recordCardTopRow}>
                        <View style={styles.recordDoctorWrap}>
                          <View style={styles.docAvatarMini}>
                            <FontAwesome5 name="user-md" size={14} color="#3B6E5C" />
                          </View>
                          <View>
                            <Text style={styles.recordDoctorName} numberOfLines={1}>
                              Dr. {rec.doctor_name}
                            </Text>
                            <View style={styles.assignedApproverPill}>
                              <Text style={styles.assignedApproverPillText}>Assigned Approver</Text>
                            </View>
                          </View>
                        </View>

                        {/* Top-Right: Status pill */}
                        {isRequested && (
                          <View
                            style={[
                              styles.statusTagPill,
                              existingReq.status === 'APPROVED' && styles.statusTagPillApproved,
                              existingReq.status === 'PENDING' && styles.statusTagPillPending,
                              existingReq.status === 'REJECTED' && styles.statusTagPillRejected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusTagPillText,
                                existingReq.status === 'APPROVED' && styles.statusTagPillTextApproved,
                                existingReq.status === 'PENDING' && styles.statusTagPillTextPending,
                                existingReq.status === 'REJECTED' && styles.statusTagPillTextRejected,
                              ]}
                            >
                              {existingReq.status === 'APPROVED'
                                ? '✓ Approved'
                                : existingReq.status === 'PENDING'
                                ? '⏳ Pending'
                                : '✕ Rejected'}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Date & Diagnosis */}
                      <View style={styles.recordMetaRow}>
                        <Ionicons name="time-outline" size={13} color="#65776F" style={{ marginRight: 4 }} />
                        <Text style={styles.recordDateText}>{formatDate(rec.visit_date_time)}</Text>
                        {formatTime(rec.visit_date_time) ? (
                          <Text style={styles.recordTimeText}>• {formatTime(rec.visit_date_time)}</Text>
                        ) : null}
                      </View>

                      <View style={styles.recordDiagnosisRow}>
                        <Text style={styles.recordDiagnosisLabel}>Diagnosis:</Text>
                        <Text style={styles.recordDiagnosisValue}>{rec.diagnosis}</Text>
                      </View>

                      {rec.symptoms ? (
                        <View style={styles.recordSymptomsRow}>
                          <Text style={styles.recordSymptomsLabel}>Symptoms:</Text>
                          <Text style={styles.recordSymptomsValue} numberOfLines={2}>
                            {rec.symptoms}
                          </Text>
                        </View>
                      ) : null}

                      {/* Bottom Selection Indicator */}
                      <View style={styles.recordCardFooter}>
                        {isRequested ? (
                          <Text style={styles.alreadyRequestedLabel}>
                            Certificate requested for this visit
                          </Text>
                        ) : (
                          <View style={styles.selectRadioRow}>
                            <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                              {isSelected && <View style={styles.radioInnerDot} />}
                            </View>
                            <Text style={[styles.selectRadioText, isSelected && styles.selectRadioTextSelected]}>
                              {isSelected ? 'Visit Selected' : 'Tap to Select'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* MULTI-LECTURER SEARCH & SELECTION SECTION */}
            {selectedRecord && (
              <View style={styles.lecturerSectionCard}>
                <View style={styles.lecturerSectionHeader}>
                  <MaterialCommunityIcons name="email-fast-outline" size={20} color="#3B6E5C" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.lecturerSectionTitle}>Tag Lecturers for Email Dispatch</Text>
                    <Text style={styles.lecturerSectionSub}>
                      Once Dr. {selectedRecord.doctor_name} approves and generates your certificate PDF, the system
                      will automatically email the official PDF to your tagged lecturers.
                    </Text>
                  </View>
                </View>

                {/* Selected Lecturer Chips */}
                {selectedLecturerIds.length > 0 && (
                  <View style={styles.selectedChipsWrap}>
                    <Text style={styles.selectedChipsLabel}>
                      Selected Recipients ({selectedLecturerIds.length}):
                    </Text>
                    <View style={styles.chipsContainer}>
                      {selectedLecturerIds.map((id) => {
                        const lecturer = lecturersList.find((l) => l.id === id);
                        if (!lecturer) return null;
                        return (
                          <View key={id} style={styles.lecturerChip}>
                            <Ionicons name="person-circle-outline" size={14} color="#3B6E5C" style={{ marginRight: 4 }} />
                            <Text style={styles.lecturerChipText} numberOfLines={1}>
                              {lecturer.name}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleRemoveLecturer(id)}
                              style={styles.chipRemoveBtn}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Ionicons name="close-circle" size={16} color="#3B6E5C" />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Lecturer Search Bar */}
                <View style={styles.searchBarBox}>
                  <Ionicons name="search" size={18} color="#65776F" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by lecturer name, department, or email..."
                    placeholderTextColor="#8A9C93"
                    value={lecturerSearchQuery}
                    onChangeText={setLecturerSearchQuery}
                  />
                  {lecturerSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setLecturerSearchQuery('')}>
                      <Ionicons name="close-circle" size={18} color="#65776F" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Lecturer List */}
                <View style={styles.lecturerListContainer}>
                  {filteredRequestLecturers.length === 0 ? (
                    <Text style={styles.noLecturerFoundText}>No lecturers found matching "{lecturerSearchQuery}"</Text>
                  ) : (
                    filteredRequestLecturers.map((lecturer) => {
                      const isChecked = selectedLecturerIds.includes(lecturer.id);
                      return (
                        <TouchableOpacity
                          key={lecturer.id}
                          style={[styles.lecturerRow, isChecked && styles.lecturerRowSelected]}
                          onPress={() => handleToggleLecturer(lecturer.id)}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.checkboxBox, isChecked && styles.checkboxBoxChecked]}>
                            {isChecked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                          </View>
                          <View style={styles.lecturerInfoWrap}>
                            <View style={styles.lecturerNameRow}>
                              <Text style={styles.lecturerName}>{lecturer.name}</Text>
                              <Text style={styles.lecturerPosition}>{lecturer.position}</Text>
                            </View>
                            <Text style={styles.lecturerDept}>{lecturer.department}</Text>
                            <Text style={styles.lecturerEmail}>✉ {lecturer.email}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </View>
            )}

            {/* CONFIRMATION SUMMARY BANNER */}
            {selectedRecord && (
              <View style={styles.summaryBannerBox}>
                <View style={styles.summaryHeaderRow}>
                  <MaterialCommunityIcons name="shield-check" size={20} color="#2A8567" />
                  <Text style={styles.summaryTitle}>Request Confirmation Summary</Text>
                </View>

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryGridItem}>
                    <Text style={styles.summaryItemLabel}>Consultation Visit</Text>
                    <Text style={styles.summaryItemValue}>
                      {formatDate(selectedRecord.visit_date_time)} • {selectedRecord.diagnosis}
                    </Text>
                  </View>

                  <View style={styles.summaryGridItem}>
                    <Text style={styles.summaryItemLabel}>Attending Doctor</Text>
                    <Text style={styles.summaryItemValue}>Dr. {selectedRecord.doctor_name}</Text>
                  </View>

                  <View style={styles.summaryGridItem}>
                    <Text style={styles.summaryItemLabel}>Tagged Lecturers</Text>
                    <Text style={styles.summaryItemValue}>
                      {selectedLecturerIds.length > 0
                        ? `${selectedLecturerIds.length} lecturer(s) tagged for auto-dispatch`
                        : 'None tagged (Certificate will be stored for personal download)'}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryNoticeRow}>
                  <Ionicons name="checkmark-circle-outline" size={15} color="#2A8567" style={{ marginRight: 6 }} />
                  <Text style={styles.summaryNoticeText}>
                    Your request will be submitted to Dr. {selectedRecord.doctor_name} for approval. Once approved and
                    generated on the web portal, the official PDF will be emailed to your tagged lecturers.
                  </Text>
                </View>

                {/* SUBMIT BUTTON */}
                <TouchableOpacity
                  style={[styles.primarySubmitBtn, isSubmitting && styles.primarySubmitBtnDisabled]}
                  onPress={handleSubmitCertificateRequest}
                  disabled={isSubmitting}
                  activeOpacity={0.88}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name="send-check"
                        size={18}
                        color="#FFFFFF"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.primarySubmitBtnText}>Submit Request to Doctor</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: MY REQUESTS & CERTIFICATES                                    */}
        {/* ==================================================================== */}
        {activeTab === 'MY_REQUESTS' && (
          <View style={styles.tabContent}>
            {/* NOTIFICATION UPDATE BANNER */}
            {activeNotifBanner && (
              <View
                style={[
                  styles.notifBanner,
                  activeNotifBanner.type === 'CERTIFICATE_APPROVED'
                    ? styles.notifBannerApproved
                    : styles.notifBannerRejected,
                ]}
              >
                <View style={styles.notifBannerIconWrap}>
                  <Ionicons
                    name={
                      activeNotifBanner.type === 'CERTIFICATE_APPROVED'
                        ? 'checkmark-circle'
                        : 'close-circle'
                    }
                    size={24}
                    color={activeNotifBanner.type === 'CERTIFICATE_APPROVED' ? '#16A34A' : '#DC2626'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifBannerTitle}>
                    {activeNotifBanner.type === 'CERTIFICATE_APPROVED'
                      ? '📄 Certificate Approved by Doctor!'
                      : '❌ Certificate Request Rejected'}
                  </Text>
                  <Text style={styles.notifBannerBody}>{activeNotifBanner.message}</Text>
                </View>
                <TouchableOpacity
                  style={styles.notifDismissBtn}
                  onPress={() => handleDismissNotification(activeNotifBanner.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.notifDismissBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* DATE FILTERING BAR */}
            <View style={styles.dateFilterContainer}>
              <View style={styles.dateFilterHeader}>
                <Ionicons name="filter-outline" size={16} color="#3B6E5C" style={{ marginRight: 6 }} />
                <Text style={styles.dateFilterTitle}>Filter Certificates by Date</Text>
                {dateFilterMode !== 'ALL' && (
                  <TouchableOpacity
                    style={styles.clearFilterBtn}
                    onPress={() => {
                      setDateFilterMode('ALL');
                      setCustomFilterDate(null);
                    }}
                  >
                    <Ionicons name="close-circle" size={14} color="#72857B" style={{ marginRight: 3 }} />
                    <Text style={styles.clearFilterText}>Reset Filter</Text>
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                <TouchableOpacity
                  style={[styles.filterChip, dateFilterMode === 'ALL' && styles.filterChipActive]}
                  onPress={() => setDateFilterMode('ALL')}
                >
                  <Text style={[styles.filterChipText, dateFilterMode === 'ALL' && styles.filterChipTextActive]}>
                    All ({storedRequests.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, dateFilterMode === 'TODAY' && styles.filterChipActive]}
                  onPress={() => setDateFilterMode('TODAY')}
                >
                  <Text style={[styles.filterChipText, dateFilterMode === 'TODAY' && styles.filterChipTextActive]}>
                    Today
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, dateFilterMode === 'LAST_7_DAYS' && styles.filterChipActive]}
                  onPress={() => setDateFilterMode('LAST_7_DAYS')}
                >
                  <Text style={[styles.filterChipText, dateFilterMode === 'LAST_7_DAYS' && styles.filterChipTextActive]}>
                    Last 7 Days
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, dateFilterMode === 'THIS_MONTH' && styles.filterChipActive]}
                  onPress={() => setDateFilterMode('THIS_MONTH')}
                >
                  <Text style={[styles.filterChipText, dateFilterMode === 'THIS_MONTH' && styles.filterChipTextActive]}>
                    This Month
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, dateFilterMode === 'CUSTOM' && styles.filterChipActive]}
                  onPress={() => setShowFilterDatePicker(true)}
                >
                  <Ionicons
                    name="calendar"
                    size={13}
                    color={dateFilterMode === 'CUSTOM' ? '#FFFFFF' : '#3B6E5C'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.filterChipText, dateFilterMode === 'CUSTOM' && styles.filterChipTextActive]}>
                    {customFilterDate ? formatDate(customFilterDate.toISOString()) : 'Select Date'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              {showFilterDatePicker && (
                <DateTimePicker
                  value={customFilterDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowFilterDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setCustomFilterDate(selectedDate);
                      setDateFilterMode('CUSTOM');
                    }
                  }}
                />
              )}
            </View>

            {/* SECTION HEADING */}
            <View style={styles.sectionHeadingRow}>
              <MaterialCommunityIcons name="history" size={18} color="#3B6E5C" style={{ marginRight: 6 }} />
              <Text style={styles.sectionHeading}>
                My Medical Certificates ({filteredStoredRequests.length})
              </Text>
            </View>

            {storedRequests.length === 0 ? (
              <View style={styles.emptyStateCard}>
                <MaterialCommunityIcons name="certificate-outline" size={48} color="#72857B" />
                <Text style={styles.emptyStateTitle}>No Certificate Requests Yet</Text>
                <Text style={styles.emptyStateBody}>
                  When you submit a medical certificate request for a consultation visit, you will be able to track
                  doctor reviews, download your official certificate PDF, and forward it to lecturers here.
                </Text>
                <TouchableOpacity
                  style={styles.emptyStateActionBtn}
                  onPress={() => setActiveTab('REQUEST')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyStateActionBtnText}>Create New Request</Text>
                </TouchableOpacity>
              </View>
            ) : filteredStoredRequests.length === 0 ? (
              <View style={styles.emptyStateCard}>
                <Ionicons name="search-outline" size={40} color="#72857B" />
                <Text style={styles.emptyStateTitle}>No Matching Certificates Found</Text>
                <Text style={styles.emptyStateBody}>
                  No certificates match your selected date filter. Try choosing "All Dates" or picking another date.
                </Text>
                <TouchableOpacity
                  style={styles.emptyStateActionBtn}
                  onPress={() => {
                    setDateFilterMode('ALL');
                    setCustomFilterDate(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyStateActionBtnText}>Reset Date Filter</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.requestsList}>
                {filteredStoredRequests.map((req) => {
                  const isPending = req.status === 'PENDING';
                  const isApproved = req.status === 'APPROVED';
                  const isRejected = req.status === 'REJECTED';
                  const isPdfReady = isApproved && (req.hasGeneratedPdf === true || !!req.signedUrl);
                  const isWaitingPdf = isApproved && !isPdfReady;
                  const isCurrentAction = actionInProgressId === req.requestId;
                  const isViewingThis = viewingCertId === req.requestId;
                  const isDownloadingThis = downloadingCertId === req.requestId;
                  const isBusyWithThis = isViewingThis || isDownloadingThis;
                  const recipients = req.recipients || [];

                  return (
                    <View key={req.requestId} style={styles.requestCard}>
                      {/* Card Header */}
                      <View style={styles.requestCardHeader}>
                        <View style={styles.requestStatusWrap}>
                          {isPending && (
                            <View style={styles.badgePending}>
                              <Text style={styles.badgePendingText}>⏳ Pending Doctor Approval</Text>
                            </View>
                          )}
                          {isApproved && isPdfReady && (
                            <View style={styles.badgeApproved}>
                              <Text style={styles.badgeApprovedText}>✅ Official PDF Ready</Text>
                            </View>
                          )}
                          {isApproved && isWaitingPdf && (
                            <View style={styles.badgeWaitingPdf}>
                              <Text style={styles.badgeWaitingPdfText}>📄 Approved • Generating PDF</Text>
                            </View>
                          )}
                          {isRejected && (
                            <View style={styles.badgeRejected}>
                              <Text style={styles.badgeRejectedText}>❌ Rejected by Doctor</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.requestTimestampText}>
                          {formatDate(req.requestedAt)}
                        </Text>
                      </View>

                      {/* Card Body Details */}
                      <View style={styles.requestCardBody}>
                        <View style={styles.requestDetailRow}>
                          <Text style={styles.requestDetailLabel}>Attending Doctor:</Text>
                          <Text style={styles.requestDetailValueBold}>Dr. {req.doctorName}</Text>
                        </View>

                        <View style={styles.requestDetailRow}>
                          <Text style={styles.requestDetailLabel}>Visit Date:</Text>
                          <Text style={styles.requestDetailValue}>{formatDate(req.visitDate)}</Text>
                        </View>

                        <View style={styles.requestDetailRow}>
                          <Text style={styles.requestDetailLabel}>Diagnosis:</Text>
                          <Text style={styles.requestDetailValue}>{req.diagnosis}</Text>
                        </View>

                        {/* Tagged Lecturers Information */}
                        {recipients.length > 0 && (
                          <View style={styles.cardRecipientsBox}>
                            <View style={styles.cardRecipientsHeader}>
                              <MaterialCommunityIcons name="email-check-outline" size={15} color="#3B6E5C" />
                              <Text style={styles.cardRecipientsTitle}>
                                Tagged Lecturers ({recipients.length}):
                              </Text>
                            </View>
                            <View style={styles.cardRecipientsList}>
                              {recipients.map((recip, rIdx) => (
                                <View key={rIdx} style={styles.recipientPill}>
                                  <Ionicons name="person-circle" size={13} color="#3B6E5C" style={{ marginRight: 4 }} />
                                  <Text style={styles.recipientPillName}>{recip.name}</Text>
                                  <View
                                    style={[
                                      styles.recipientStatusDot,
                                      recip.sentAt || isPdfReady
                                        ? styles.recipientStatusSent
                                        : styles.recipientStatusQueued,
                                    ]}
                                  />
                                  <Text style={styles.recipientStatusLabel}>
                                    {recip.sentAt
                                      ? `Sent ${formatDate(recip.sentAt)}`
                                      : isPdfReady
                                      ? 'Emailed'
                                      : 'Queued'}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}

                        {/* Doctor Notes (if rejected or commented) */}
                        {req.doctorNotes ? (
                          <View style={styles.doctorNotesBox}>
                            <Text style={styles.doctorNotesTitle}>Doctor's Remarks:</Text>
                            <Text style={styles.doctorNotesText}>{req.doctorNotes}</Text>
                          </View>
                        ) : null}

                        {/* If Approved but Doctor hasn't clicked "Generate" yet on Web App */}
                        {isWaitingPdf && (
                          <View style={styles.waitingPdfNoticeBox}>
                            <Ionicons name="information-circle-outline" size={16} color="#B45309" style={{ marginRight: 6 }} />
                            <Text style={styles.waitingPdfNoticeText}>
                              Approved by Doctor — Waiting for doctor/clinic to generate the official PDF file on the portal.
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Card Actions */}
                      <View style={styles.requestCardActions}>
                        {isPending && (
                          <TouchableOpacity
                            style={styles.checkStatusBtn}
                            onPress={() => handleCheckStatus(req)}
                            disabled={isCurrentAction}
                            activeOpacity={0.8}
                          >
                            {isCurrentAction ? (
                              <ActivityIndicator size="small" color="#3B6E5C" />
                            ) : (
                              <>
                                <Ionicons name="refresh-circle-outline" size={17} color="#3B6E5C" style={{ marginRight: 6 }} />
                                <Text style={styles.checkStatusBtnText}>Check Approval Status</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}

                        {isApproved && isPdfReady && (
                          <View style={styles.approvedActionsContainer}>
                            <View style={styles.approvedActionsRow}>
                              <TouchableOpacity
                                style={styles.viewCertBtn}
                                onPress={() => handleViewCertificate(req)}
                                disabled={isBusyWithThis}
                                activeOpacity={0.8}
                              >
                                {isViewingThis ? (
                                  <>
                                    <ActivityIndicator size="small" color="#3B6E5C" style={{ marginRight: 6 }} />
                                    <Text style={styles.viewCertBtnText}>Opening...</Text>
                                  </>
                                ) : (
                                  <>
                                    <Ionicons name="eye-outline" size={16} color="#3B6E5C" style={{ marginRight: 5 }} />
                                    <Text style={styles.viewCertBtnText}>View Certificate</Text>
                                  </>
                                )}
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[styles.downloadCertBtn, isBusyWithThis && styles.downloadCertBtnDisabled]}
                                onPress={() => handleDownloadCertificate(req)}
                                disabled={isBusyWithThis}
                                activeOpacity={0.8}
                              >
                                {isDownloadingThis ? (
                                  <>
                                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                                    <Text style={styles.downloadCertBtnText}>Downloading...</Text>
                                  </>
                                ) : (
                                  <>
                                    <Ionicons name="download-outline" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
                                    <Text style={styles.downloadCertBtnText}>Download PDF</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>

                            {/* "Send to Forgotten Lecturer" Button */}
                            <TouchableOpacity
                              style={styles.sendLecturerBtn}
                              onPress={() => handleOpenForwardModal(req)}
                              activeOpacity={0.85}
                            >
                              <Ionicons name="mail-outline" size={16} color="#3B6E5C" style={{ marginRight: 6 }} />
                              <Text style={styles.sendLecturerBtnText}>+ Send to Additional Lecturer</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {isApproved && isWaitingPdf && (
                          <TouchableOpacity
                            style={styles.checkPdfBtn}
                            onPress={() => handleCheckStatus(req)}
                            disabled={isCurrentAction}
                            activeOpacity={0.8}
                          >
                            {isCurrentAction ? (
                              <ActivityIndicator size="small" color="#3B6E5C" />
                            ) : (
                              <>
                                <Ionicons name="refresh-circle-outline" size={17} color="#3B6E5C" style={{ marginRight: 6 }} />
                                <Text style={styles.checkPdfBtnText}>Check for Generated PDF</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}

                        {isRejected && (
                          <View style={styles.rejectedBanner}>
                            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                            <Text style={styles.rejectedBannerText}>
                              Please consult the medical center desk if you require an amendment.
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ==================================================================== */}
      {/* MODAL: FORWARD CERTIFICATE TO FORGOTTEN LECTURERS                    */}
      {/* ==================================================================== */}
      <Modal
        visible={forwardModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseForwardModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderIconWrap}>
                <Ionicons name="mail" size={20} color="#3B6E5C" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.modalTitle}>Send to Lecturer</Text>
                <Text style={styles.modalSubTitle}>Forward your official approved certificate PDF</Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseForwardModal}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#65776F" />
              </TouchableOpacity>
            </View>

            {/* Certificate Brief Preview */}
            {forwardingRequest && (
              <View style={styles.modalCertPreview}>
                <Text style={styles.modalCertPreviewTitle}>
                  Medical Certificate: {forwardingRequest.diagnosis}
                </Text>
                <Text style={styles.modalCertPreviewText}>
                  Attending Doctor: Dr. {forwardingRequest.doctorName} • Visit Date: {formatDate(forwardingRequest.visitDate)}
                </Text>
                {forwardingRequest.recipients && forwardingRequest.recipients.length > 0 && (
                  <Text style={styles.modalCertRecipientsText}>
                    Previously sent to: {forwardingRequest.recipients.map((r) => r.name).join(', ')}
                  </Text>
                )}
              </View>
            )}

            {/* Selected Lecturers Chips in Modal */}
            {selectedForwardLecturerIds.length > 0 && (
              <View style={styles.modalChipsBox}>
                <Text style={styles.modalChipsLabel}>Selected for Email ({selectedForwardLecturerIds.length}):</Text>
                <View style={styles.chipsContainer}>
                  {selectedForwardLecturerIds.map((id) => {
                    const lecturer = lecturersList.find((l) => l.id === id);
                    if (!lecturer) return null;
                    return (
                      <View key={id} style={styles.lecturerChip}>
                        <Text style={styles.lecturerChipText}>{lecturer.name}</Text>
                        <TouchableOpacity
                          onPress={() => handleToggleForwardLecturer(id)}
                          style={styles.chipRemoveBtn}
                        >
                          <Ionicons name="close-circle" size={15} color="#3B6E5C" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Search Bar in Modal */}
            <View style={styles.searchBarBox}>
              <Ionicons name="search" size={17} color="#65776F" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search lecturer name, dept, email..."
                placeholderTextColor="#8A9C93"
                value={forwardLecturerSearchQuery}
                onChangeText={setForwardLecturerSearchQuery}
              />
              {forwardLecturerSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setForwardLecturerSearchQuery('')}>
                  <Ionicons name="close-circle" size={17} color="#65776F" />
                </TouchableOpacity>
              )}
            </View>

            {/* Lecturer List in Modal */}
            <ScrollView style={styles.modalLecturerScroll} showsVerticalScrollIndicator={false}>
              {filteredForwardLecturers.map((lecturer) => {
                const isChecked = selectedForwardLecturerIds.includes(lecturer.id);
                const isAlreadySent =
                  forwardingRequest?.recipients?.some((r) => r.staffId === lecturer.id) || false;

                return (
                  <TouchableOpacity
                    key={lecturer.id}
                    style={[styles.lecturerRow, isChecked && styles.lecturerRowSelected]}
                    onPress={() => handleToggleForwardLecturer(lecturer.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.checkboxBox, isChecked && styles.checkboxBoxChecked]}>
                      {isChecked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                    </View>
                    <View style={styles.lecturerInfoWrap}>
                      <View style={styles.lecturerNameRow}>
                        <Text style={styles.lecturerName}>{lecturer.name}</Text>
                        {isAlreadySent && (
                          <View style={styles.alreadySentTag}>
                            <Text style={styles.alreadySentTagText}>Sent</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.lecturerDept}>{lecturer.department}</Text>
                      <Text style={styles.lecturerEmail}>✉ {lecturer.email}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Modal Bottom Actions */}
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={handleCloseForwardModal}
                disabled={isSendingToLecturers}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSendBtn,
                  selectedForwardLecturerIds.length === 0 && styles.modalSendBtnDisabled,
                ]}
                onPress={handleSendCertificateToLecturers}
                disabled={isSendingToLecturers || selectedForwardLecturerIds.length === 0}
              >
                {isSendingToLecturers ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalSendBtnText}>
                      Send to {selectedForwardLecturerIds.length} Lecturer(s)
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EAF3ED',
  },
  headerBanner: {
    backgroundColor: '#D5E6DC',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#C4D8CC',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B6E5C',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#16211C',
  },
  refreshHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#4A5952',
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 14,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2EEE7',
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: '#3B6E5C',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B6E5C',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  tabBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  tabBadgeInactive: {
    backgroundColor: '#D1E3D8',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabBadgeTextActive: {
    color: '#3B6E5C',
  },
  tabBadgeTextInactive: {
    color: '#4A5952',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  tabContent: {
    width: '100%',
  },
  subtleHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCECE2',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  subtleHintText: {
    fontSize: 12,
    color: '#4A5952',
    flex: 1,
    fontWeight: '500',
    lineHeight: 16,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16211C',
  },
  loaderWrap: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    fontSize: 13,
    color: '#4A5952',
    marginTop: 10,
  },
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCECE2',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16211C',
    marginTop: 10,
    marginBottom: 4,
  },
  emptyStateBody: {
    fontSize: 13,
    color: '#65776F',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
  },
  emptyStateActionBtn: {
    marginTop: 16,
    backgroundColor: '#3B6E5C',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  emptyStateActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  recordsList: {
    marginBottom: 16,
  },
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCECE2',
    padding: 14,
    marginBottom: 12,
  },
  recordCardSelected: {
    borderColor: '#3B6E5C',
    borderWidth: 2,
    backgroundColor: '#F5FAF7',
  },
  recordCardRequested: {
    opacity: 0.85,
    backgroundColor: '#FAFAF9',
  },
  recordCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recordDoctorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  docAvatarMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAF3ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  recordDoctorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16211C',
  },
  assignedApproverPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EAF3ED',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginTop: 2,
  },
  assignedApproverPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3B6E5C',
  },
  recordMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  recordDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5952',
  },
  recordTimeText: {
    fontSize: 12,
    color: '#65776F',
    marginLeft: 4,
  },
  recordDiagnosisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  recordDiagnosisLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16211C',
    marginRight: 5,
  },
  recordDiagnosisValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2A8567',
    flex: 1,
  },
  recordSymptomsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recordSymptomsLabel: {
    fontSize: 12,
    color: '#65776F',
    marginRight: 5,
  },
  recordSymptomsValue: {
    fontSize: 12,
    color: '#4A5952',
    flex: 1,
  },
  recordCardFooter: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alreadyRequestedLabel: {
    fontSize: 12,
    color: '#72857B',
    fontWeight: '500',
  },
  selectRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#9BB5A9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  radioCircleSelected: {
    borderColor: '#3B6E5C',
  },
  radioInnerDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#3B6E5C',
  },
  selectRadioText: {
    fontSize: 12,
    color: '#65776F',
  },
  selectRadioTextSelected: {
    color: '#3B6E5C',
    fontWeight: '700',
  },
  statusTagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTagPillPending: {
    backgroundColor: '#FEF3C7',
  },
  statusTagPillApproved: {
    backgroundColor: '#DCFCE7',
  },
  statusTagPillRejected: {
    backgroundColor: '#FEE2E2',
  },
  statusTagPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTagPillTextPending: {
    color: '#D97706',
  },
  statusTagPillTextApproved: {
    color: '#16A34A',
  },
  statusTagPillTextRejected: {
    color: '#DC2626',
  },

  // ── Lecturer Picker Styles ──
  lecturerSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCECE2',
    padding: 14,
    marginBottom: 16,
  },
  lecturerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  lecturerSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16211C',
  },
  lecturerSectionSub: {
    fontSize: 12,
    color: '#65776F',
    marginTop: 2,
    lineHeight: 16,
  },
  selectedChipsWrap: {
    marginBottom: 10,
  },
  selectedChipsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B6E5C',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  lecturerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF3ED',
    borderWidth: 1,
    borderColor: '#C4D8CC',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  lecturerChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16211C',
    maxWidth: 160,
  },
  chipRemoveBtn: {
    marginLeft: 4,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5FAF7',
    borderWidth: 1,
    borderColor: '#DCECE2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#16211C',
    padding: 0,
  },
  lecturerListContainer: {
    maxHeight: 220,
  },
  lecturerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: '#FAFAF9',
  },
  lecturerRowSelected: {
    backgroundColor: '#EAF3ED',
    borderWidth: 1,
    borderColor: '#3B6E5C',
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#9BB5A9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxChecked: {
    backgroundColor: '#3B6E5C',
    borderColor: '#3B6E5C',
  },
  lecturerInfoWrap: {
    flex: 1,
  },
  lecturerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lecturerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16211C',
  },
  lecturerPosition: {
    fontSize: 11,
    color: '#3B6E5C',
    fontWeight: '600',
  },
  lecturerDept: {
    fontSize: 11,
    color: '#65776F',
    marginTop: 1,
  },
  lecturerEmail: {
    fontSize: 11,
    color: '#72857B',
    marginTop: 1,
  },
  noLecturerFoundText: {
    fontSize: 12,
    color: '#72857B',
    textAlign: 'center',
    paddingVertical: 14,
    fontStyle: 'italic',
  },

  // ── Confirmation Summary Banner ──
  summaryBannerBox: {
    backgroundColor: '#EAF3ED',
    borderWidth: 1.5,
    borderColor: '#C4D8CC',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#16211C',
    marginLeft: 6,
  },
  summaryGrid: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCECE2',
    marginBottom: 10,
  },
  summaryGridItem: {
    marginBottom: 6,
  },
  summaryItemLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#65776F',
    textTransform: 'uppercase',
  },
  summaryItemValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16211C',
    marginTop: 1,
  },
  summaryNoticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  summaryNoticeText: {
    fontSize: 12,
    color: '#4A5952',
    lineHeight: 17,
    flex: 1,
  },
  primarySubmitBtn: {
    backgroundColor: '#3B6E5C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#3B6E5C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  primarySubmitBtnDisabled: {
    backgroundColor: '#9BB5A9',
  },
  primarySubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── My Certificates Tab & Date Filtering ──
  dateFilterContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCECE2',
    padding: 12,
    marginBottom: 14,
  },
  dateFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateFilterTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16211C',
    flex: 1,
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F5FAF7',
  },
  clearFilterText: {
    fontSize: 11,
    color: '#65776F',
    fontWeight: '600',
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5FAF7',
    borderWidth: 1,
    borderColor: '#DCECE2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  filterChipActive: {
    backgroundColor: '#3B6E5C',
    borderColor: '#3B6E5C',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5952',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  notifBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  notifBannerApproved: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  notifBannerRejected: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  notifBannerIconWrap: {
    marginRight: 10,
  },
  notifBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16211C',
    marginBottom: 2,
  },
  notifBannerBody: {
    fontSize: 12,
    color: '#4A5952',
  },
  notifDismissBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  notifDismissBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A5952',
  },
  requestsList: {
    marginBottom: 16,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCECE2',
    padding: 16,
    marginBottom: 14,
  },
  requestCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5F2',
  },
  requestStatusWrap: {
    flex: 1,
  },
  badgePending: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgePendingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  badgeApproved: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeApprovedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  badgeWaitingPdf: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeWaitingPdfText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  badgeRejected: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeRejectedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  requestTimestampText: {
    fontSize: 11,
    color: '#72857B',
  },
  requestCardBody: {
    marginBottom: 14,
  },
  requestDetailRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  requestDetailLabel: {
    fontSize: 12,
    color: '#65776F',
    width: 120,
  },
  requestDetailValue: {
    fontSize: 12,
    color: '#16211C',
    flex: 1,
    fontWeight: '500',
  },
  requestDetailValueBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16211C',
    flex: 1,
  },

  // Tagged Lecturers Box on Card
  cardRecipientsBox: {
    backgroundColor: '#F5FAF7',
    borderWidth: 1,
    borderColor: '#DCECE2',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  cardRecipientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardRecipientsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B6E5C',
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  cardRecipientsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recipientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C4D8CC',
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  recipientPillName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16211C',
    marginRight: 5,
  },
  recipientStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  recipientStatusSent: {
    backgroundColor: '#16A34A',
  },
  recipientStatusQueued: {
    backgroundColor: '#F59E0B',
  },
  recipientStatusLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#65776F',
  },

  doctorNotesBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 8,
  },
  doctorNotesTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  doctorNotesText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 16,
  },
  waitingPdfNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  waitingPdfNoticeText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
    lineHeight: 16,
  },

  // Card Actions
  requestCardActions: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
  },
  checkStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3ED',
    borderWidth: 1,
    borderColor: '#DCECE2',
    borderRadius: 10,
    paddingVertical: 10,
  },
  checkStatusBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B6E5C',
  },
  approvedActionsContainer: {
    gap: 8,
  },
  approvedActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  viewCertBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3ED',
    borderWidth: 1,
    borderColor: '#DCECE2',
    borderRadius: 10,
    paddingVertical: 10,
  },
  viewCertBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B6E5C',
  },
  downloadCertBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 10,
    paddingVertical: 10,
  },
  downloadCertBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  downloadCertBtnDisabled: {
    opacity: 0.7,
  },
  sendLecturerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#3B6E5C',
    borderRadius: 10,
    paddingVertical: 9,
  },
  sendLecturerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B6E5C',
  },
  checkPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3ED',
    borderWidth: 1,
    borderColor: '#3B6E5C',
    borderRadius: 10,
    paddingVertical: 10,
  },
  checkPdfBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B6E5C',
  },
  rejectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 8,
  },
  rejectedBannerText: {
    fontSize: 11,
    color: '#991B1B',
    flex: 1,
  },

  // ── Modal Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAF3ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16211C',
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#65776F',
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCertPreview: {
    backgroundColor: '#F5FAF7',
    borderWidth: 1,
    borderColor: '#DCECE2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  modalCertPreviewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16211C',
  },
  modalCertPreviewText: {
    fontSize: 11,
    color: '#4A5952',
    marginTop: 2,
  },
  modalCertRecipientsText: {
    fontSize: 11,
    color: '#3B6E5C',
    fontWeight: '600',
    marginTop: 4,
  },
  modalChipsBox: {
    marginBottom: 10,
  },
  modalChipsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B6E5C',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalLecturerScroll: {
    maxHeight: 220,
    marginBottom: 14,
  },
  alreadySentTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  alreadySentTagText: {
    fontSize: 10,
    color: '#16A34A',
    fontWeight: '700',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCECE2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5FAF7',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#65776F',
  },
  modalSendBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B6E5C',
  },
  modalSendBtnDisabled: {
    backgroundColor: '#9BB5A9',
  },
  modalSendBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
