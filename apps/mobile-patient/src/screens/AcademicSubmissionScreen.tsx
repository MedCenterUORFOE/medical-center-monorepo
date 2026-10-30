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
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
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
}

interface ServerNotificationItem {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  sent_at: string;
}

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

  // Stored Requests & Sync State
  const [storedRequests, setStoredRequests] = useState<StoredCertificateRequest[]>([]);
  const [activeNotifBanner, setActiveNotifBanner] = useState<ServerNotificationItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Digital Certificate Fallback Modal State
  const [digitalCertModalItem, setDigitalCertModalItem] = useState<StoredCertificateRequest | null>(null);

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
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    return { token, userId, apiUrl };
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

  // ── 3. Synchronize Stored Requests with Backend Notifications ──
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

      // Also probe signed URL for any PENDING requests to check if doctor generated the PDF
      for (const item of updatedList) {
        if (item.status === 'PENDING') {
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
                item.updatedAt = new Date().toISOString();
                hasChanges = true;
              }
            }
          } catch {
            // Ignore probe errors
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

      // Strict backend payload schema: { record_id, doctor_id, recipient_staff_ids }
      const payload = {
        record_id: selectedRecord.id,
        doctor_id: selectedRecord.doctor_id,
        recipient_staff_ids: [],
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
        };

        const updatedRequests = [newEntry, ...storedRequests];
        await saveStoredRequests(updatedRequests);

        Alert.alert(
          'Request Submitted',
          `Your medical certificate request has been dispatched to Dr. ${selectedRecord.doctor_name}. You will receive a notification once reviewed.`,
          [
            {
              text: 'View Status',
              onPress: () => {
                setActiveTab('MY_REQUESTS');
                setSelectedRecord(null);
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

      // 1. Probe signed URL
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
              ? { ...r, status: 'APPROVED' as const, signedUrl: signed, updatedAt: new Date().toISOString() }
              : r
          );
          await saveStoredRequests(updated);
          Alert.alert('Certificate Approved!', 'Your medical certificate has been approved and is ready to download.');
          return;
        }
      }

      // 2. Refresh notifications
      await syncWithNotificationsAndStorage();
      Alert.alert(
        'Status Checked',
        item.status === 'PENDING'
          ? `Your request is currently pending review by Dr. ${item.doctorName}.`
          : `Your request status is: ${item.status}`
      );
    } catch (err: any) {
      Alert.alert('Status Check Failed', err.message || 'Please try again later.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // ── 6. View Certificate via Signed URL ──
  const handleViewCertificate = async (item: StoredCertificateRequest) => {
    setActionInProgressId(item.requestId);
    try {
      const { token, apiUrl } = await getAuthCredentials();
      if (!token || !apiUrl) throw new Error('Session expired.');

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

      if (signRes.status === 404) {
        // Doctor approved on web, but PDF generation not executed yet -> show Digital Certificate Card
        setDigitalCertModalItem(item);
        return;
      }

      if (!signRes.ok) {
        throw new Error('Unable to generate secure download link.');
      }

      const signJson = await signRes.json().catch(() => null);
      const signedUrl = signJson?.data?.signed_url || signJson?.signed_url;

      if (!signedUrl) {
        setDigitalCertModalItem(item);
        return;
      }

      // Open in system browser / PDF viewer
      const canOpen = await Linking.canOpenURL(signedUrl);
      if (canOpen) {
        await Linking.openURL(signedUrl);
      } else {
        setDigitalCertModalItem(item);
      }
    } catch (err: any) {
      console.warn('View Certificate Error:', err);
      // Fallback to digital summary modal
      setDigitalCertModalItem(item);
    } finally {
      setActionInProgressId(null);
    }
  };

  // ── 7. Download & Share Certificate PDF ──
  const handleDownloadCertificate = async (item: StoredCertificateRequest) => {
    setActionInProgressId(item.requestId);
    try {
      const { token, apiUrl } = await getAuthCredentials();
      if (!token || !apiUrl) throw new Error('Session expired.');

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

      if (signRes.status === 404) {
        Alert.alert(
          'Certificate Approved',
          'Your certificate is officially approved by the doctor. The physical PDF file is being prepared by the clinic archive.',
          [
            { text: 'View Digital Certificate', onPress: () => setDigitalCertModalItem(item) },
            { text: 'OK' },
          ]
        );
        return;
      }

      if (!signRes.ok) {
        throw new Error('Server could not provide a download token.');
      }

      const signJson = await signRes.json().catch(() => null);
      const signedUrl = signJson?.data?.signed_url || signJson?.signed_url;

      if (!signedUrl) {
        throw new Error('Invalid download URL received.');
      }

      // Download using FileSystem
      const filename = `Medical_Certificate_${Date.now()}.pdf`;
      const localTarget = `${FileSystem.cacheDirectory || ''}${filename}`;

      const downloadResult = await FileSystem.downloadAsync(signedUrl, localTarget);

      if (downloadResult.status !== 200) {
        throw new Error('Failed to download the certificate PDF file.');
      }

      // Share / Save to device
      await Share.share(
        Platform.OS === 'ios'
          ? { url: downloadResult.uri }
          : {
              title: 'Official Medical Certificate',
              message: `Official Medical Certificate issued by Dr. ${item.doctorName} for visit on ${formatDate(item.visitDate)} (${item.diagnosis})`,
              url: downloadResult.uri,
            }
      );
    } catch (err: any) {
      console.error('Download Certificate Error:', err);
      Alert.alert('Download Failed', err.message || 'Unable to download certificate.');
    } finally {
      setActionInProgressId(null);
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
          Request and download official medical certificates.
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
                Select a consultation visit below to request a certificate from your doctor.
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

                        {/* Top-Right: Clean status pill if requested, otherwise left completely clean */}
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
                </View>

                <View style={styles.summaryNoticeRow}>
                  <Ionicons name="checkmark-circle-outline" size={15} color="#2A8567" style={{ marginRight: 6 }} />
                  <Text style={styles.summaryNoticeText}>
                    Your request will be sent directly to Dr. {selectedRecord.doctor_name} for approval. You will
                    receive a notification once your Medical Certificate is ready to download.
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
            {/* NOTIFICATION UPDATE BANNER (IF UNREAD UPDATE FOUND) */}
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

            {/* SECTION HEADING */}
            <View style={styles.sectionHeadingRow}>
              <MaterialCommunityIcons name="history" size={18} color="#3B6E5C" style={{ marginRight: 6 }} />
              <Text style={styles.sectionHeading}>Submitted Certificate Requests ({storedRequests.length})</Text>
            </View>

            {storedRequests.length === 0 ? (
              <View style={styles.emptyStateCard}>
                <MaterialCommunityIcons name="certificate-outline" size={48} color="#72857B" />
                <Text style={styles.emptyStateTitle}>No Certificate Requests Yet</Text>
                <Text style={styles.emptyStateBody}>
                  When you submit a medical certificate request for a consultation visit, you will be able to track
                  doctor reviews and download your official certificate PDF here.
                </Text>
                <TouchableOpacity
                  style={styles.emptyStateActionBtn}
                  onPress={() => setActiveTab('REQUEST')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyStateActionBtnText}>Create New Request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.requestsList}>
                {storedRequests.map((req) => {
                  const isPending = req.status === 'PENDING';
                  const isApproved = req.status === 'APPROVED';
                  const isRejected = req.status === 'REJECTED';
                  const isCurrentAction = actionInProgressId === req.requestId;

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
                          {isApproved && (
                            <View style={styles.badgeApproved}>
                              <Text style={styles.badgeApprovedText}>✅ Approved by Doctor</Text>
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

                      {/* Card Body Details - Clean Clinical Information Only */}
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

                        {/* Doctor Notes (if rejected or commented) */}
                        {req.doctorNotes ? (
                          <View style={styles.doctorNotesBox}>
                            <Text style={styles.doctorNotesTitle}>Doctor's Remarks:</Text>
                            <Text style={styles.doctorNotesText}>{req.doctorNotes}</Text>
                          </View>
                        ) : null}
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

                        {isApproved && (
                          <View style={styles.approvedActionsRow}>
                            <TouchableOpacity
                              style={styles.viewCertBtn}
                              onPress={() => handleViewCertificate(req)}
                              disabled={isCurrentAction}
                              activeOpacity={0.8}
                            >
                              {isCurrentAction ? (
                                <ActivityIndicator size="small" color="#3B6E5C" />
                              ) : (
                                <>
                                  <Ionicons name="eye-outline" size={16} color="#3B6E5C" style={{ marginRight: 5 }} />
                                  <Text style={styles.viewCertBtnText}>View Certificate</Text>
                                </>
                              )}
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.downloadCertBtn}
                              onPress={() => handleDownloadCertificate(req)}
                              disabled={isCurrentAction}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="download-outline" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
                              <Text style={styles.downloadCertBtnText}>Download PDF</Text>
                            </TouchableOpacity>
                          </View>
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

      {/* DIGITAL CERTIFICATE FALLBACK MODAL */}
      <Modal
        visible={!!digitalCertModalItem}
        transparent
        animationType="fade"
        onRequestClose={() => setDigitalCertModalItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.digitalCertCard}>
            <View style={styles.certSealRow}>
              <MaterialCommunityIcons name="certificate" size={36} color="#3B6E5C" />
              <View style={styles.verifiedStamp}>
                <Text style={styles.verifiedStampText}>OFFICIALLY APPROVED</Text>
              </View>
            </View>

            <Text style={styles.certInstitutionTitle}>UNIVERSITY MEDICAL CENTER</Text>
            <Text style={styles.certDocHeading}>Digital Medical Certificate</Text>

            <View style={styles.certDivider} />

            {digitalCertModalItem && (
              <View style={styles.certBodySection}>
                <Text style={styles.certBodyText}>
                  This certifies that clinical examination on {formatDate(digitalCertModalItem.visitDate)} was assessed and authorized by:
                </Text>

                <View style={styles.certInfoBox}>
                  <Text style={styles.certDoctorName}>Dr. {digitalCertModalItem.doctorName}</Text>
                  <Text style={styles.certDiagnosis}>Clinical Diagnosis: {digitalCertModalItem.diagnosis}</Text>
                  <Text style={styles.certVisitDate}>Date of Examination: {formatDate(digitalCertModalItem.visitDate)}</Text>
                </View>

                <Text style={styles.certNoticeText}>
                  Status: Approved by Medical Officer. The official PDF document is being generated and archived in the university records vault.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setDigitalCertModalItem(null)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseBtnText}>Close Certificate</Text>
            </TouchableOpacity>
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
    maxWidth: 280,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  digitalCertCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: '#3B6E5C',
  },
  certSealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  verifiedStamp: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#16A34A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedStampText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16A34A',
    letterSpacing: 0.5,
  },
  certInstitutionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B6E5C',
    letterSpacing: 1,
  },
  certDocHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#16211C',
    marginTop: 2,
  },
  certDivider: {
    height: 1,
    backgroundColor: '#DCECE2',
    marginVertical: 12,
  },
  certBodySection: {
    marginBottom: 16,
  },
  certBodyText: {
    fontSize: 13,
    color: '#4A5952',
    lineHeight: 18,
    marginBottom: 12,
  },
  certInfoBox: {
    backgroundColor: '#F5FAF7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCECE2',
    padding: 12,
    marginBottom: 12,
  },
  certDoctorName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#16211C',
    marginBottom: 4,
  },
  certDiagnosis: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2A8567',
    marginBottom: 4,
  },
  certVisitDate: {
    fontSize: 12,
    color: '#4A5952',
    marginBottom: 2,
  },
  certNoticeText: {
    fontSize: 11,
    color: '#65776F',
    lineHeight: 15,
  },
  modalCloseBtn: {
    backgroundColor: '#3B6E5C',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
