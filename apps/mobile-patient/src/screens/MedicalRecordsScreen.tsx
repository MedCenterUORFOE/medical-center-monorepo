import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LOCAL_STORAGE_CACHE_KEY = 'localMedicalReportFiles';

// ── Types & Interfaces ──
export interface MedicalReportItem {
  id: string;
  record_id: string;
  file_url: string;
  type: string;
  upload_time: string;
  // Parent Consultation Metadata
  doctorName: string;
  visitDate: string;
  diagnosis: string;
}

export interface ConsultationOption {
  id: string;
  doctorName: string;
  visitDate: string;
  diagnosis: string;
  symptoms: string;
}

type FilterCategory = 'All' | 'Blood Test' | 'Lab Report' | 'Ultrasound' | 'ECG' | 'Other';

interface ReportTypeOption {
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  category: FilterCategory;
}

interface SelectedImageState {
  uri: string;
  name: string;
  type: string;
  base64?: string;
}

const REPORT_TYPE_OPTIONS: ReportTypeOption[] = [
  { key: 'BLOOD_TEST', label: 'Blood Test', icon: 'water', category: 'Blood Test' },
  { key: 'LAB_REPORT', label: 'Lab Report', icon: 'flask', category: 'Lab Report' },
  { key: 'ULTRASOUND', label: 'Ultrasound', icon: 'pulse', category: 'Ultrasound' },
  { key: 'ECG', label: 'ECG Report', icon: 'heart-pulse', category: 'ECG' },
  { key: 'OTHER', label: 'Other Document', icon: 'file-document-outline', category: 'Other' },
];

const REPORT_CATEGORIES = REPORT_TYPE_OPTIONS;

const FILTER_CHIPS: FilterCategory[] = [
  'All',
  'Blood Test',
  'Lab Report',
  'Ultrasound',
  'ECG',
  'Other',
];

// Legacy report types mapping for backward compatibility with existing records in DB
const LEGACY_REPORT_TYPE_META: Record<
  string,
  { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  'X-RAY': { label: 'X-Ray', icon: 'radioactive' },
  'X_RAY': { label: 'X-Ray', icon: 'radioactive' },
  'MRI_SCAN': { label: 'MRI Scan', icon: 'magnet' },
  'CT_SCAN': { label: 'CT Scan', icon: 'camera-metering-center' },
};

// ── Pure JS Base64 to Uint8Array decoder (reliable across React Native engines) ──
function base64ToUint8Array(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === '=') {
    bufferLength--;
    if (base64[base64.length - 2] === '=') {
      bufferLength--;
    }
  }
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (p < bufferLength) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    if (p < bufferLength) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }
  return bytes;
}

// ── Helper formatters ──
const formatDate = (value?: string | null): string => {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const resolveReportTypeMeta = (rawType?: string | null): {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  category: FilterCategory;
} => {
  if (!rawType) {
    return { label: 'Medical Report', icon: 'file-document-outline', category: 'Other' };
  }
  const clean = rawType.trim().toUpperCase().replace(/\s+/g, '_');
  const found = REPORT_TYPE_OPTIONS.find(
    (opt) => opt.key === clean || opt.key.replace(/-/g, '_') === clean.replace(/-/g, '_')
  );
  if (found) {
    return { label: found.label, icon: found.icon, category: found.category };
  }

  // Handle legacy report types (X-RAY, MRI_SCAN, CT_SCAN) safely so they display cleanly under 'All' or 'Other'
  const legacyKey = clean.replace(/-/g, '_');
  if (LEGACY_REPORT_TYPE_META[clean] || LEGACY_REPORT_TYPE_META[legacyKey]) {
    const legacy = LEGACY_REPORT_TYPE_META[clean] || LEGACY_REPORT_TYPE_META[legacyKey];
    return { label: legacy.label, icon: legacy.icon, category: 'Other' };
  }

  // Friendly fallback formatting
  const pretty = rawType
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return { label: pretty, icon: 'file-document-outline', category: 'Other' };
};

export default function MedicalRecordsScreen() {
  const router = useRouter();

  // Screen State
  const [reports, setReports] = useState<MedicalReportItem[]>([]);
  const [consultations, setConsultations] = useState<ConsultationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>('All');
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);

  // Upload Modal State
  const [isUploadModalVisible, setIsUploadModalVisible] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string>('');
  const [selectedReportTypeKey, setSelectedReportTypeKey] = useState<string>('BLOOD_TEST');
  const [customReportType, setCustomReportType] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<SelectedImageState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // In-App Image Preview Modal State
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // ── Authentication token retrieval ──
  const getAuthCredentials = async () => {
    const token =
      (await AsyncStorage.getItem('userToken')) || (await SecureStore.getItemAsync('userToken'));
    const userId =
      (await AsyncStorage.getItem('userId')) || (await SecureStore.getItemAsync('userId'));
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    return { token, userId, apiUrl };
  };

  // ── Fetch Consultations & Nested Reports ──
  const loadMedicalRecords = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { token, userId, apiUrl } = await getAuthCredentials();

      if (!apiUrl) {
        throw new Error('API server URL is not configured.');
      }
      if (!token) {
        throw new Error('You are not logged in. Please sign in again.');
      }
      if (!userId) {
        throw new Error('Unable to identify the current patient account.');
      }

      const response = await fetch(`${apiUrl}/api/records/history/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const textData = await response.text();
        console.error('History Fetch Error:', response.status, textData);
        setErrorMessage(`HTTP ${response.status}: ${textData || 'Unable to retrieve medical history.'}`);
        setReports([]);
        setConsultations([]);
        return;
      }

      const payload = await response.json();
      const rawHistory: any[] = payload?.data?.history || payload?.history || [];

      const parsedConsultations: ConsultationOption[] = [];
      const parsedReports: MedicalReportItem[] = [];

      rawHistory.forEach((rec: any) => {
        const recId = String(rec.id);
        const doctorName =
          rec.doctor_name ||
          rec.doctor?.staff?.user?.name ||
          rec.doctor?.name ||
          'Assigned Doctor';
        const visitDate = rec.visit_date_time || rec.visit_date || rec.created_at || '';
        const diagnosis = rec.diagnosis || 'Clinical Consultation';
        const symptoms = rec.symptoms || '';

        parsedConsultations.push({
          id: recId,
          doctorName,
          visitDate,
          diagnosis,
          symptoms,
        });

        if (Array.isArray(rec.reports) && rec.reports.length > 0) {
          rec.reports.forEach((rep: any, idx: number) => {
            parsedReports.push({
              id: String(rep.id || `${recId}-rep-${idx}`),
              record_id: recId,
              file_url: rep.file_url || '',
              type: rep.type || 'LAB_REPORT',
              upload_time: rep.upload_time || rep.created_at || visitDate,
              doctorName,
              visitDate,
              diagnosis,
            });
          });
        }
      });

      // Sort newest upload first
      parsedReports.sort((a, b) => new Date(b.upload_time).getTime() - new Date(a.upload_time).getTime());

      setConsultations(parsedConsultations);
      setReports(parsedReports);

      // Pre-select the latest consultation visit for uploading
      if (parsedConsultations.length > 0 && !selectedRecordId) {
        setSelectedRecordId(parsedConsultations[0].id);
      }
    } catch (error: any) {
      console.error('Fetch Medical Records Error:', error);
      setErrorMessage(error?.message || 'Failed to connect to the medical center server.');
      setReports([]);
      setConsultations([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedRecordId]);

  useEffect(() => {
    void loadMedicalRecords();
  }, [loadMedicalRecords]);

  // ── Filtered Reports ──
  const filteredReports = useMemo(() => {
    if (selectedFilter === 'All') return reports;
    return reports.filter((item) => {
      const meta = resolveReportTypeMeta(item.type);
      return meta.category === selectedFilter;
    });
  }, [reports, selectedFilter]);

  // ── Document Viewing (Data URLs, Local Cache & Signed URLs) ──
  const handleViewReport = async (item: MedicalReportItem) => {
    if (!item.file_url) {
      Alert.alert('Unavailable', 'No file attachment URL was found for this report.');
      return;
    }

    const typeMeta = resolveReportTypeMeta(item.type);
    setPreviewTitle(typeMeta.label);

    // CASE A: Direct Data URI (base64 stored in DB), local file URI, or content URI
    if (
      item.file_url.startsWith('data:image/') ||
      item.file_url.startsWith('file://') ||
      item.file_url.startsWith('content://')
    ) {
      setPreviewUri(item.file_url);
      return;
    }

    // Direct HTTP / HTTPS image or document URL
    if (item.file_url.startsWith('http://') || item.file_url.startsWith('https://')) {
      const isImg = /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(item.file_url);
      if (isImg) {
        setPreviewUri(item.file_url);
      } else {
        await Linking.openURL(item.file_url);
      }
      return;
    }

    // CASE B: Check Local Device AsyncStorage Cache
    try {
      const cachedRaw = await AsyncStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
      if (cachedRaw) {
        const localMap: Record<string, string> = JSON.parse(cachedRaw);
        const cachedUri = localMap[item.file_url] || localMap[item.id];
        if (cachedUri) {
          setPreviewUri(cachedUri);
          return;
        }
      }
    } catch (cacheErr) {
      console.warn('Local report cache lookup error:', cacheErr);
    }

    // CASE C: Cloud Storage Path -> Request Signed URL from Backend
    try {
      setOpeningReportId(item.id);
      const { token, apiUrl } = await getAuthCredentials();

      if (!apiUrl || !token) {
        throw new Error('Authentication session or API URL missing.');
      }

      const response = await fetch(
        `${apiUrl}/api/documents/sign-url?file_path=${encodeURIComponent(item.file_url)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const json = await response.json();

      if (!response.ok || !json.data?.signed_url) {
        // For older test records created before cloud storage was configured
        Alert.alert(
          'Report Unavailable',
          'This older test record was uploaded before cloud storage was configured, so the physical file is not available on the server.\n\nPlease upload a new report to view or share it.',
          [{ text: 'OK' }]
        );
        return;
      }

      const signedUrl = json.data.signed_url;

      // Check if image vs PDF / other
      const isImage =
        /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(item.file_url) ||
        /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(signedUrl);

      if (isImage) {
        setPreviewUri(signedUrl);
      } else {
        // PDF or external document - open via Linking
        await Linking.openURL(signedUrl);
      }
    } catch (error: any) {
      console.error('Error opening report:', error);
      Alert.alert(
        'Connection Notice',
        'Unable to download this medical report. Please check your internet connection and try again.'
      );
    } finally {
      setOpeningReportId(null);
    }
  };

  // ── Image Picker Workflow (with base64 and quality: 0.5) ──
  const handlePickImage = async (useCamera: boolean) => {
    try {
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
        allowsEditing: false,
      };

      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Denied', 'Camera permission is required to capture reports.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync(pickerOptions);
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          const name = asset.fileName || `report_${Date.now()}.jpg`;
          setSelectedImage({
            uri: asset.uri,
            name,
            type: asset.mimeType || 'image/jpeg',
            base64: asset.base64 || '',
          });
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Denied', 'Gallery access is required to attach files.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          const name = asset.fileName || `report_${Date.now()}.jpg`;
          setSelectedImage({
            uri: asset.uri,
            name,
            type: asset.mimeType || 'image/jpeg',
            base64: asset.base64 || '',
          });
        }
      }
    } catch (err: any) {
      console.error('Image picking failed:', err);
      Alert.alert('Selection Error', 'Failed to pick image from device.');
    }
  };

  // ── Open Upload Modal Check ──
  const handleOpenUploadModal = () => {
    if (consultations.length === 0) {
      Alert.alert(
        'Doctor Consultation Required',
        'In order to upload diagnostic reports or laboratory tests, you must have an existing clinical consultation record with a university doctor. No consultation visits were found on your profile.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Book Consultation',
            onPress: () => router.push('/(tabs)/appointment' as any),
          },
        ]
      );
      return;
    }
    if (!selectedRecordId && consultations.length > 0) {
      setSelectedRecordId(consultations[0].id);
    }
    setIsUploadModalVisible(true);
  };

  // ── Reset Upload Form ──
  const resetUploadForm = () => {
    setSelectedReportTypeKey('BLOOD_TEST');
    setCustomReportType('');
    setSelectedImage(null);
    setIsSubmitting(false);
  };

  // ── Submit Report to Backend ──
  const handleSubmitReport = async () => {
    if (!selectedRecordId) {
      Alert.alert('Missing Field', 'Please select a consultation visit for this report.');
      return;
    }

    let finalReportType = selectedReportTypeKey;
    if (selectedReportTypeKey === 'OTHER') {
      if (!customReportType.trim() || customReportType.trim().length < 2) {
        Alert.alert('Invalid Type', 'Please specify a document name (at least 2 characters).');
        return;
      }
      finalReportType = customReportType.trim().toUpperCase();
    }

    if (!selectedImage) {
      Alert.alert('Missing File', 'Please capture or choose a report file or photo.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { token, apiUrl } = await getAuthCredentials();
      if (!apiUrl || !token) {
        throw new Error('Authentication session expired. Please log in again.');
      }

      const cleanFileName = selectedImage.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageFilePath = `${selectedRecordId}/${Date.now()}-${cleanFileName}`;
      const dataUri = selectedImage.base64
        ? `data:${selectedImage.type || 'image/jpeg'};base64,${selectedImage.base64}`
        : selectedImage.uri;

      let fileUrlToSave = '';
      let supabaseUploadedSuccessfully = false;

      // 1. Attempt upload to Supabase Storage if configured and base64 is available
      const hasSupabase =
        process.env.EXPO_PUBLIC_SUPABASE_URL &&
        !process.env.EXPO_PUBLIC_SUPABASE_URL.includes('placeholder');

      if (hasSupabase && selectedImage.base64) {
        try {
          const uint8Array = base64ToUint8Array(selectedImage.base64);
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('medical-documents')
            .upload(storageFilePath, uint8Array, {
              contentType: selectedImage.type || 'image/jpeg',
              upsert: true,
            });

          if (!uploadError && uploadData?.path) {
            fileUrlToSave = uploadData.path;
            supabaseUploadedSuccessfully = true;
          } else if (uploadError) {
            console.warn('Supabase storage upload error:', uploadError.message);
          }
        } catch (uploadException) {
          console.warn('Supabase upload exception:', uploadException);
        }
      }

      // If Supabase upload didn't succeed (e.g., Anon key RLS restriction or missing credentials),
      // we store the dataUri directly into PostgreSQL (TEXT column has no limit).
      // This guarantees the image is saved and viewable everywhere without 404!
      if (!supabaseUploadedSuccessfully) {
        fileUrlToSave = dataUri;
      }

      // 2. Persist to local device cache in AsyncStorage as a failsafe
      try {
        const existingCacheRaw = await AsyncStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
        const cacheMap: Record<string, string> = existingCacheRaw ? JSON.parse(existingCacheRaw) : {};
        cacheMap[storageFilePath] = dataUri;
        cacheMap[selectedImage.uri] = dataUri;
        if (fileUrlToSave) {
          cacheMap[fileUrlToSave] = dataUri;
        }
        await AsyncStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(cacheMap));
      } catch (cacheErr) {
        console.warn('Local cache write error:', cacheErr);
      }

      // 3. Submit to backend API: POST /api/reports/upload
      const response = await fetch(`${apiUrl}/api/reports/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          record_id: selectedRecordId,
          file_url: fileUrlToSave,
          type: finalReportType,
        }),
      });

      const responseJson = await response.json();

      if (!response.ok || responseJson.success === false) {
        throw new Error(responseJson.message || 'Server rejected the report submission.');
      }

      // Save report.id mapping in cache if returned
      if (responseJson.data?.report?.id) {
        try {
          const existingCacheRaw = await AsyncStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
          const cacheMap: Record<string, string> = existingCacheRaw ? JSON.parse(existingCacheRaw) : {};
          cacheMap[responseJson.data.report.id] = dataUri;
          await AsyncStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(cacheMap));
        } catch {}
      }

      Alert.alert(
        'Upload Successful',
        'Your medical report has been attached to your clinical record and your attending doctor has been notified.',
        [
          {
            text: 'OK',
            onPress: () => {
              setIsUploadModalVisible(false);
              resetUploadForm();
              void loadMedicalRecords();
            },
          },
        ]
      );
    } catch (err: any) {
      console.error('Submit report error:', err);
      Alert.alert('Upload Failed', err?.message || 'Could not upload report to the medical center.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render Report Card ──
  const renderReportCard = ({ item }: { item: MedicalReportItem }) => {
    const typeMeta = resolveReportTypeMeta(item.type);
    const isOpening = openingReportId === item.id;
    const isDirectImage = item.file_url.startsWith('data:image/');

    return (
      <View style={styles.card}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.typeIconContainer}>
            {isDirectImage ? (
              <Image source={{ uri: item.file_url }} style={styles.cardThumbImg} />
            ) : (
              <MaterialCommunityIcons name={typeMeta.icon} size={24} color="#3B6E5C" />
            )}
          </View>

          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {typeMeta.label}
            </Text>
            <View style={styles.uploadTimeRow}>
              <Ionicons name="cloud-upload-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.uploadTimeText}>Uploaded {formatDate(item.upload_time)}</Text>
            </View>
          </View>

          {/* Status Badge */}
          <View style={styles.statusPill}>
            <Ionicons name="checkmark-circle" size={13} color="#2A8567" style={{ marginRight: 4 }} />
            <Text style={styles.statusPillText}>Shared</Text>
          </View>
        </View>

        {/* Linked Consultation Info */}
        <View style={styles.consultationDetailBox}>
          <View style={styles.consultationDetailRow}>
            <Ionicons name="person-outline" size={14} color="#3B6E5C" style={styles.metaIcon} />
            <Text style={styles.consultationDetailText} numberOfLines={1}>
              Attending: <Text style={styles.boldText}>{item.doctorName.startsWith('Dr') ? item.doctorName : `Dr. ${item.doctorName}`}</Text>
            </Text>
          </View>

          <View style={styles.consultationDetailRow}>
            <Ionicons name="calendar-outline" size={14} color="#3B6E5C" style={styles.metaIcon} />
            <Text style={styles.consultationDetailText}>
              Visit Date: <Text style={styles.boldText}>{formatDate(item.visitDate)}</Text>
            </Text>
          </View>

          {item.diagnosis ? (
            <View style={styles.consultationDetailRow}>
              <Ionicons name="pulse-outline" size={14} color="#3B6E5C" style={styles.metaIcon} />
              <Text style={styles.consultationDetailText} numberOfLines={1}>
                Diagnosis: <Text style={styles.boldText}>{item.diagnosis}</Text>
              </Text>
            </View>
          ) : null}
        </View>

        {/* Action Button: View / Download */}
        <TouchableOpacity
          style={styles.viewDocButton}
          onPress={() => handleViewReport(item)}
          disabled={isOpening}
          activeOpacity={0.8}
        >
          {isOpening ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
              <Text style={styles.viewDocButtonText}>View / Download Report</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ── Render Empty State ──
  const renderEmptyState = () => {
    if (isLoading || errorMessage) return null;

    return (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIconCircle}>
          <MaterialCommunityIcons name="file-document-outline" size={38} color="#3B6E5C" />
        </View>
        <Text style={styles.emptyTitle}>
          {selectedFilter === 'All'
            ? 'No Medical Reports Uploaded'
            : `No ${selectedFilter} Reports Found`}
        </Text>
        <Text style={styles.emptyDescription}>
          {selectedFilter === 'All'
            ? 'You have not uploaded any laboratory test results, ultrasounds, or medical reports yet.'
            : `No reports in the "${selectedFilter}" category were found on your file.`}
        </Text>

        <TouchableOpacity
          style={styles.emptyActionButton}
          onPress={handleOpenUploadModal}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.emptyActionButtonText}>Upload Medical Report</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#D5E6DC" />

      {/* ── TOP HEADER WITH BACK BUTTON ── */}
      <View style={styles.header}>
        <View style={styles.headerNavRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color="#16211C" />
          </TouchableOpacity>

          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitleText}>Medical Reports</Text>
            <Text style={styles.headerSubtitleText}>
              Diagnostic lab tests, ultrasounds, and doctor documents
            </Text>
          </View>
        </View>

        {/* ── SUMMARY STATS BAR & QUICK UPLOAD CTA ── */}
        <View style={styles.statsCardContainer}>
          <View style={styles.statsLeftCol}>
            <Text style={styles.statsCountNumber}>{reports.length}</Text>
            <Text style={styles.statsCountLabel}>Total Reports Attached</Text>
          </View>

          <TouchableOpacity
            style={styles.headerUploadCta}
            onPress={handleOpenUploadModal}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.headerUploadCtaText}>Upload Report</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── MAIN SURFACE ── */}
      <View style={styles.surface}>
        {/* Filter Chips Bar */}
        <View style={styles.filterBarWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {FILTER_CHIPS.map((chip) => {
              const isSelected = selectedFilter === chip;
              return (
                <TouchableOpacity
                  key={chip}
                  style={[styles.filterChip, isSelected && styles.filterChipActive]}
                  onPress={() => setSelectedFilter(chip)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                    {chip}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Reports Content */}
        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#3B6E5C" />
            <Text style={styles.loaderLabel}>Loading medical reports...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={32} color="#DC2626" />
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorBody}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadMedicalRecords} activeOpacity={0.8}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredReports}
            keyExtractor={(item) => item.id}
            renderItem={renderReportCard}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={loadMedicalRecords}
                tintColor="#3B6E5C"
                colors={['#3B6E5C']}
              />
            }
          />
        )}
      </View>

      {/* ── UPLOAD REPORT MODAL ── */}
      <Modal
        visible={isUploadModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isSubmitting) setIsUploadModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalSheetContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitleText}>Upload Medical Report</Text>
                <Text style={styles.modalSubtitleText}>
                  Attach a document or test result to your file
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  if (!isSubmitting) {
                    setIsUploadModalVisible(false);
                    resetUploadForm();
                  }
                }}
                disabled={isSubmitting}
              >
                <Ionicons name="close" size={22} color="#16211C" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalFormContent}
            >
              {/* STEP 1: Select Consultation Visit */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>
                  1. Select Clinical Consultation <Text style={styles.requiredStar}>*</Text>
                </Text>
                <Text style={styles.formHint}>
                  Reports must be linked to a consultation visit with the university medical staff.
                </Text>

                {consultations.length === 0 ? (
                  <View style={styles.warningCallout}>
                    <Ionicons name="warning-outline" size={18} color="#A65E18" />
                    <Text style={styles.warningCalloutText}>
                      No clinical consultation visits found on your account.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.consultationPickerWrap}>
                    {consultations.map((c) => {
                      const isSelected = selectedRecordId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.consultationOptionCard,
                            isSelected && styles.consultationOptionCardActive,
                          ]}
                          onPress={() => setSelectedRecordId(c.id)}
                          activeOpacity={0.75}
                        >
                          <Ionicons
                            name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={isSelected ? '#3B6E5C' : '#4A5952'}
                            style={{ marginRight: 8 }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.consultationOptionDoctor} numberOfLines={1}>
                              {c.doctorName.startsWith('Dr') ? c.doctorName : `Dr. ${c.doctorName}`}
                            </Text>
                            <Text style={styles.consultationOptionMeta}>
                              {formatDate(c.visitDate)} • {c.diagnosis}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* STEP 2: Select Report Type */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>
                  2. Report Type / Category <Text style={styles.requiredStar}>*</Text>
                </Text>

                <View style={styles.typeChipsGrid}>
                  {REPORT_TYPE_OPTIONS.map((opt) => {
                    const isSelected = selectedReportTypeKey === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.typeChip, isSelected && styles.typeChipActive]}
                        onPress={() => setSelectedReportTypeKey(opt.key)}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons
                          name={opt.icon}
                          size={16}
                          color={isSelected ? '#FFFFFF' : '#3B6E5C'}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.typeChipText, isSelected && styles.typeChipTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedReportTypeKey === 'OTHER' && (
                  <View style={styles.customTypeInputWrap}>
                    <Text style={styles.customInputLabel}>Specify Document Name</Text>
                    <TextInput
                      style={styles.customTextInput}
                      placeholder="e.g. Endoscopy Result, Allergy Screen"
                      placeholderTextColor={colors.placeholder}
                      value={customReportType}
                      onChangeText={setCustomReportType}
                      maxLength={50}
                    />
                  </View>
                )}
              </View>

              {/* STEP 3: Attach Report File */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>
                  3. Attach Document or Photo <Text style={styles.requiredStar}>*</Text>
                </Text>

                {selectedImage ? (
                  <View style={styles.fileSelectedPreviewBox}>
                    <Image source={{ uri: selectedImage.uri }} style={styles.previewThumbnail} />
                    <View style={styles.fileSelectedMeta}>
                      <Text style={styles.fileSelectedName} numberOfLines={1}>
                        {selectedImage.name}
                      </Text>
                      <Text style={styles.fileSelectedHint}>Ready for upload</Text>
                      <TouchableOpacity
                        style={styles.removeFileLink}
                        onPress={() => setSelectedImage(null)}
                      >
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                        <Text style={styles.removeFileText}>Remove or Replace</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.imagePickerButtonsRow}>
                    <TouchableOpacity
                      style={styles.pickImageBtn}
                      onPress={() => handlePickImage(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="camera-outline" size={20} color="#3B6E5C" />
                      <Text style={styles.pickImageBtnText}>Take Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.pickImageBtn}
                      onPress={() => handlePickImage(false)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="images-outline" size={20} color="#3B6E5C" />
                      <Text style={styles.pickImageBtnText}>From Gallery</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* STEP 4: Submit Button */}
              <TouchableOpacity
                style={[
                  styles.submitUploadBtn,
                  (!selectedImage || isSubmitting) && styles.submitUploadBtnDisabled,
                ]}
                onPress={handleSubmitReport}
                disabled={!selectedImage || isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.submitUploadBtnText}>Submit & Notify Doctor</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── IN-APP IMAGE PREVIEW MODAL ── */}
      <Modal
        visible={!!previewUri}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewUri(null)}
      >
        <SafeAreaView style={styles.previewBackdrop}>
          <View style={styles.previewHeaderBar}>
            <Text style={styles.previewHeaderTitle} numberOfLines={1}>
              {previewTitle || 'Report Preview'}
            </Text>
            <TouchableOpacity
              style={styles.previewCloseBtn}
              onPress={() => setPreviewUri(null)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.previewImageContainer}>
            {previewUri && (
              <Image
                source={{ uri: previewUri }}
                style={styles.fullPreviewImage}
                resizeMode="contain"
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Export aliases for maximum compatibility ──
export {
  MedicalRecordsScreen,
  MedicalRecordsScreen as MedicalReportsScreen,
  REPORT_TYPE_OPTIONS,
  REPORT_CATEGORIES,
};

// ── Styles (Calm Sage / Mint Green Theme) ──
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#D5E6DC',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#D5E6DC',
  },
  headerNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#D1E3D8',
    elevation: 1,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerTitleText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#16211C',
    letterSpacing: -0.4,
  },
  headerSubtitleText: {
    fontSize: 13,
    color: '#4A5952',
    marginTop: 2,
  },
  statsCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D1E3D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statsLeftCol: {
    justifyContent: 'center',
  },
  statsCountNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#16211C',
  },
  statsCountLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5952',
    marginTop: 1,
  },
  headerUploadCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 14,
    elevation: 2,
  },
  headerUploadCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  surface: {
    flex: 1,
    backgroundColor: '#EAF3ED',
  },
  filterBarWrapper: {
    backgroundColor: '#EAF3ED',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#D1E3D8',
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1E3D8',
  },
  filterChipActive: {
    backgroundColor: '#3B6E5C',
    borderColor: '#3B6E5C',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A5952',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D1E3D8',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  typeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E2F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardThumbImg: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#16211C',
    marginBottom: 3,
  },
  uploadTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  uploadTimeText: {
    fontSize: 12,
    color: '#4A5952',
    fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2F5E9',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#C3E7D3',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2A8567',
    textTransform: 'uppercase',
  },
  consultationDetailBox: {
    backgroundColor: '#F4F9F6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2EDE6',
    gap: 6,
  },
  consultationDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    marginRight: 6,
  },
  consultationDetailText: {
    fontSize: 13,
    color: '#4A5952',
    flex: 1,
  },
  boldText: {
    fontWeight: '700',
    color: '#16211C',
  },
  viewDocButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 24,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#3B6E5C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  viewDocButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loaderLabel: {
    fontSize: 14,
    color: '#4A5952',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#D1E3D8',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: '#E2F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#16211C',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4A5952',
    textAlign: 'center',
    marginBottom: 18,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  emptyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    marginTop: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 8,
    marginBottom: 4,
  },
  errorBody: {
    fontSize: 13,
    color: '#4A5952',
    textAlign: 'center',
    marginBottom: 14,
  },
  retryBtn: {
    backgroundColor: '#3B6E5C',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#D1E3D8',
  },
  modalTitleText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#16211C',
  },
  modalSubtitleText: {
    fontSize: 13,
    color: '#4A5952',
    marginTop: 2,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAF3ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFormContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16211C',
    marginBottom: 4,
  },
  requiredStar: {
    color: '#DC2626',
  },
  formHint: {
    fontSize: 12,
    color: '#4A5952',
    marginBottom: 10,
  },
  warningCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBF0D1',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#F2DFAC',
  },
  warningCalloutText: {
    flex: 1,
    fontSize: 12,
    color: '#A65E18',
    lineHeight: 16,
  },
  consultationPickerWrap: {
    gap: 8,
  },
  consultationOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#D1E3D8',
  },
  consultationOptionCardActive: {
    backgroundColor: '#EAF3ED',
    borderColor: '#3B6E5C',
  },
  consultationOptionDoctor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16211C',
  },
  consultationOptionMeta: {
    fontSize: 12,
    color: '#4A5952',
    marginTop: 2,
  },
  typeChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#EAF3ED',
    borderWidth: 1,
    borderColor: '#D1E3D8',
  },
  typeChipActive: {
    backgroundColor: '#3B6E5C',
    borderColor: '#3B6E5C',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B6E5C',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  customTypeInputWrap: {
    marginTop: 12,
  },
  customInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5952',
    marginBottom: 6,
  },
  customTextInput: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#D1E3D8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#16211C',
  },
  imagePickerButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickImageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3ED',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#D1E3D8',
    borderStyle: 'dashed',
  },
  pickImageBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B6E5C',
  },
  fileSelectedPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1E3D8',
  },
  previewThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#EAF3ED',
  },
  fileSelectedMeta: {
    flex: 1,
  },
  fileSelectedName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16211C',
    marginBottom: 2,
  },
  fileSelectedHint: {
    fontSize: 12,
    color: '#2A8567',
    fontWeight: '600',
    marginBottom: 6,
  },
  removeFileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removeFileText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  submitUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 24,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
    elevation: 2,
  },
  submitUploadBtnDisabled: {
    backgroundColor: '#9BB5A9',
    elevation: 0,
  },
  submitUploadBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  previewHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  previewCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullPreviewImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
});
