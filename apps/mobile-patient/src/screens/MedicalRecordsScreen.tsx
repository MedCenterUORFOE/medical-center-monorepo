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
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import * as FileSystem from 'expo-file-system/legacy';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LOCAL_STORAGE_CACHE_KEY = 'localMedicalReportFiles';
const REPORT_URI_CACHE_PREFIX = 'report_uri_';

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

export interface PrescriptionItemData {
  id: string;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration?: string | null;
  instructions?: string | null;
}

export interface PrescriptionData {
  id: string;
  status: string;
  instructions?: string | null;
  items?: PrescriptionItemData[];
}

export interface ConsultationVisit {
  id: string;
  doctorName: string;
  visitDate: string;
  diagnosis: string;
  symptoms?: string | null;
  treatmentPlan?: string | null;
  prescriptionNotes?: string | null;
  followUpDate?: string | null;
  notes?: string | null;
  prescription?: PrescriptionData | null;
  reportsCount: number;
  reports: MedicalReportItem[];
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

const formatTime = (value?: string | null): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
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
  const [activeSegment, setActiveSegment] = useState<'VISITS' | 'REPORTS'>('VISITS');
  const [visits, setVisits] = useState<ConsultationVisit[]>([]);
  const [reports, setReports] = useState<MedicalReportItem[]>([]);
  const [consultations, setConsultations] = useState<ConsultationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>('All');
  const [selectedRecordFilter, setSelectedRecordFilter] = useState<string>('ALL');
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

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
  const [currentPreviewItem, setCurrentPreviewItem] = useState<MedicalReportItem | null>(null);

  useEffect(() => {
    // Purge legacy oversized monolithic cache key that causes CursorWindow overflow on Android
    void AsyncStorage.removeItem(LOCAL_STORAGE_CACHE_KEY).catch(() => {});
  }, []);

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
        setVisits([]);
        setConsultations([]);
        return;
      }

      const payload = await response.json();
      const rawHistory: any[] = payload?.data?.history || payload?.history || [];

      const parsedConsultations: ConsultationOption[] = [];
      const parsedVisits: ConsultationVisit[] = [];
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
        const symptoms = rec.symptoms || null;
        const treatmentPlan = rec.treatment_plan || null;
        const prescriptionNotes = rec.prescription_notes || null;
        const followUpDate = rec.follow_up_date || null;
        const notes = rec.notes || null;

        let prescription: PrescriptionData | null = null;
        if (rec.prescription) {
          prescription = {
            id: String(rec.prescription.id),
            status: rec.prescription.status || 'ACTIVE',
            instructions: rec.prescription.instructions || null,
            items: Array.isArray(rec.prescription.items)
              ? rec.prescription.items.map((it: any) => ({
                  id: String(it.id),
                  medicine_name: it.medicine_name || 'Medication',
                  dosage: it.dosage || '',
                  frequency: it.frequency || '',
                  duration: it.duration || null,
                  instructions: it.instructions || null,
                }))
              : [],
          };
        }

        const visitReports: MedicalReportItem[] = [];
        if (Array.isArray(rec.reports) && rec.reports.length > 0) {
          rec.reports.forEach((rep: any, idx: number) => {
            const item: MedicalReportItem = {
              id: String(rep.id || `${recId}-rep-${idx}`),
              record_id: recId,
              file_url: rep.file_url || '',
              type: rep.type || 'LAB_REPORT',
              upload_time: rep.upload_time || rep.created_at || visitDate,
              doctorName,
              visitDate,
              diagnosis,
            };
            visitReports.push(item);
            parsedReports.push(item);
          });
        }

        parsedConsultations.push({
          id: recId,
          doctorName,
          visitDate,
          diagnosis,
          symptoms: symptoms || '',
        });

        parsedVisits.push({
          id: recId,
          doctorName,
          visitDate,
          diagnosis,
          symptoms,
          treatmentPlan,
          prescriptionNotes,
          followUpDate,
          notes,
          prescription,
          reportsCount: visitReports.length,
          reports: visitReports,
        });
      });

      // Sort newest upload and newest visit first
      parsedReports.sort((a, b) => new Date(b.upload_time).getTime() - new Date(a.upload_time).getTime());
      parsedVisits.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());

      setConsultations(parsedConsultations);
      setVisits(parsedVisits);
      setReports(parsedReports);

      // Pre-select the latest consultation visit for uploading
      if (parsedConsultations.length > 0 && !selectedRecordId) {
        setSelectedRecordId(parsedConsultations[0].id);
      }
    } catch (error: any) {
      console.error('Fetch Medical Records Error:', error);
      setErrorMessage(error?.message || 'Failed to connect to the medical center server.');
      setReports([]);
      setVisits([]);
      setConsultations([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedRecordId]);

  useEffect(() => {
    void loadMedicalRecords();
  }, [loadMedicalRecords]);

  // ── Filtered Reports (by Category & Medical Record ID) ──
  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      // 1. Filter by category chip
      if (selectedFilter !== 'All') {
        const meta = resolveReportTypeMeta(item.type);
        if (meta.category !== selectedFilter) return false;
      }
      // 2. Filter by consultation record ID
      if (selectedRecordFilter !== 'ALL') {
        if (item.record_id !== selectedRecordFilter) return false;
      }
      return true;
    });
  }, [reports, selectedFilter, selectedRecordFilter]);

  // ── Resolve Report URL (Local Cache, Direct URL, or Cloud Signed URL) ──
  const resolveReportUrl = async (
    item: MedicalReportItem
  ): Promise<{ url: string; isDirectData: boolean }> => {
    if (!item.file_url) {
      throw new Error('No file attachment URL was found for this report.');
    }

    // 1. Direct Data URI (base64)
    if (item.file_url.startsWith('data:image/')) {
      return { url: item.file_url, isDirectData: true };
    }

    // 2. Direct Local File or Content URI
    if (item.file_url.startsWith('file://') || item.file_url.startsWith('content://')) {
      return { url: item.file_url, isDirectData: false };
    }

    // 3. Direct HTTP / HTTPS URL
    if (item.file_url.startsWith('http://') || item.file_url.startsWith('https://')) {
      return { url: item.file_url, isDirectData: false };
    }

    // 4. Check Per-Report Local Device Cache Key
    try {
      const localUri = await AsyncStorage.getItem(`${REPORT_URI_CACHE_PREFIX}${item.id}`);
      if (localUri && (localUri.startsWith('file://') || localUri.startsWith('content://'))) {
        return { url: localUri, isDirectData: false };
      }
    } catch {
      // Continue to cloud resolution
    }

    // 5. Cloud Storage Path -> Request Signed URL from Backend
    const { token, apiUrl } = await getAuthCredentials();
    if (!apiUrl || !token) {
      throw new Error('Authentication session or API server URL missing. Please log in again.');
    }

    // Ensure path targets reports/ subfolder within medical-documents bucket
    const cloudPath = item.file_url.startsWith('reports/')
      ? item.file_url
      : `reports/${item.file_url}`;

    const response = await fetch(
      `${apiUrl}/api/documents/sign-url?file_path=${encodeURIComponent(cloudPath)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Cookie: `session_token=${token}`,
        },
      }
    );

    const json = await response.json().catch(() => null);
    const signedUrl = json?.data?.signed_url || json?.signed_url;

    if (!response.ok || !signedUrl) {
      throw new Error(
        json?.message ||
          json?.error?.message ||
          'This medical report file is not available on the cloud storage server.'
      );
    }

    return { url: signedUrl, isDirectData: false };
  };

  // ── Document Viewing (In-App Modal / External PDF) ──
  const handleViewReport = async (item: MedicalReportItem) => {
    setOpeningReportId(item.id);
    try {
      const typeMeta = resolveReportTypeMeta(item.type);
      setPreviewTitle(typeMeta.label);
      setCurrentPreviewItem(item);

      const { url } = await resolveReportUrl(item);

      const isImg =
        url.startsWith('data:image/') ||
        url.startsWith('file://') ||
        url.startsWith('content://') ||
        /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(item.file_url) ||
        /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(url);

      if (isImg) {
        setPreviewUri(url);
      } else {
        // PDF or external document - open via Linking
        const supported = await Linking.canOpenURL(url).catch(() => false);
        if (supported) {
          await Linking.openURL(url);
        } else {
          Alert.alert('Cannot Open', 'No application found to view this document format.');
        }
      }
    } catch (err: any) {
      console.error('Error opening report:', err);
      Alert.alert(
        'Report Unavailable',
        err?.message || 'Unable to open this report. Please check your network connection.'
      );
    } finally {
      setOpeningReportId(null);
    }
  };

  // ── Document Downloading (Direct File Download / StorageAccessFramework / Share) ──
  const handleDownloadReport = async (item: MedicalReportItem) => {
    setDownloadingReportId(item.id);
    try {
      const typeMeta = resolveReportTypeMeta(item.type);

      // ── Step 1: Resolve File Content into Base64 & MIME Type ──
      let base64Data = '';
      let mimeType = 'image/jpeg';
      let ext = 'jpg';

      if (item.file_url.startsWith('data:')) {
        // Case A: Report URL is directly a data: URI (Base64)
        const mimeMatch = item.file_url.match(/^data:([^;]+);base64,/);
        if (mimeMatch) {
          mimeType = mimeMatch[1];
        }
        base64Data = item.file_url.replace(/^data:[^;]+;base64,/, '');
      } else {
        // Check for local file or content URI (direct or cached)
        let localUri: string | null = null;
        if (item.file_url.startsWith('file://') || item.file_url.startsWith('content://')) {
          localUri = item.file_url;
        } else {
          try {
            const cached = await AsyncStorage.getItem(`${REPORT_URI_CACHE_PREFIX}${item.id}`);
            if (cached && (cached.startsWith('file://') || cached.startsWith('content://'))) {
              localUri = cached;
            }
          } catch {
            // ignore cache lookup errors
          }
        }

        if (localUri) {
          // Case B: Local URI from upload session or cache
          if (/\.png$/i.test(localUri)) {
            mimeType = 'image/png';
            ext = 'png';
          } else if (/\.pdf$/i.test(localUri)) {
            mimeType = 'application/pdf';
            ext = 'pdf';
          }
          base64Data = await FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } else {
          // Case C: Remote URL (Cloud storage path or external URL)
          let remoteUrl = item.file_url;
          if (!remoteUrl.startsWith('http://') && !remoteUrl.startsWith('https://')) {
            const { token, apiUrl } = await getAuthCredentials();
            if (!apiUrl || !token) {
              throw new Error('Authentication session expired. Please log in again.');
            }
            const cloudPath = item.file_url.startsWith('reports/')
              ? item.file_url
              : `reports/${item.file_url}`;

            const signRes = await fetch(
              `${apiUrl}/api/documents/sign-url?file_path=${encodeURIComponent(cloudPath)}`,
              {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                  Cookie: `session_token=${token}`,
                },
              }
            );
            const signJson = await signRes.json().catch(() => null);
            const signedUrl = signJson?.data?.signed_url || signJson?.signed_url;
            if (!signRes.ok || !signedUrl) {
              throw new Error(
                signJson?.message || 'Report file is not available on the server.'
              );
            }
            remoteUrl = signedUrl;
          }

          if (/\.png/i.test(remoteUrl)) {
            mimeType = 'image/png';
            ext = 'png';
          } else if (/\.pdf/i.test(remoteUrl)) {
            mimeType = 'application/pdf';
            ext = 'pdf';
          }

          const tempCacheFile = `${FileSystem.cacheDirectory || ''}temp_dl_${Date.now()}.${ext}`;
          const downloadResult = await FileSystem.downloadAsync(remoteUrl, tempCacheFile);
          base64Data = await FileSystem.readAsStringAsync(downloadResult.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true }).catch(() => {});
        }
      }

      if (mimeType.includes('png')) {
        ext = 'png';
      } else if (mimeType.includes('pdf')) {
        ext = 'pdf';
      } else if (mimeType.includes('webp')) {
        ext = 'webp';
      }

      const cleanLabel = typeMeta.label.replace(/[^a-zA-Z0-9]/g, '_');
      const cleanFileName = `Medical_Report_${cleanLabel}_${item.id.slice(0, 8)}.${ext}`;

      // ── Step 2: Save File to Device ──
      // On Android: Use StorageAccessFramework so user can choose destination folder (Downloads, Documents, etc.)
      if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
        try {
          const permissions =
            await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
              permissions.directoryUri,
              cleanFileName,
              mimeType
            );
            await FileSystem.writeAsStringAsync(destUri, base64Data, {
              encoding: FileSystem.EncodingType.Base64,
            });
            Alert.alert(
              'Download Complete',
              `Your medical report "${cleanFileName}" has been saved to your selected folder.`
            );
            return;
          } else {
            Alert.alert(
              'Download Cancelled',
              'No folder was selected. If you wish to save this report, please select a destination folder.'
            );
            return;
          }
        } catch (safErr: any) {
          console.warn('StorageAccessFramework error, falling back to local documents:', safErr);
        }
      }

      // ── Fallback (iOS or if SAF was bypassed) ──
      const saveDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      const localSavedUri = `${saveDirectory}${cleanFileName}`;

      await FileSystem.writeAsStringAsync(localSavedUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (Platform.OS === 'ios') {
        // On iOS, Share.share with a file URI opens the native "Save to Files / Save Image" sheet
        await Share.share({
          title: cleanFileName,
          url: localSavedUri,
        });
      } else {
        await Share.share({
          title: cleanFileName,
          url: localSavedUri,
          message: `Medical Report: ${cleanFileName}`,
        });
        Alert.alert(
          'Report Saved',
          `Your medical report was saved to your device: ${cleanFileName}`
        );
      }
    } catch (err: any) {
      console.error('Download error:', err);
      Alert.alert(
        'Download Error',
        err?.message || 'Unable to download report. Please check device permissions and try again.'
      );
    } finally {
      setDownloadingReportId(null);
    }
  };

  // ── Image Picker Workflow (with base64 and quality: 0.4) ──
  const handlePickImage = async (useCamera: boolean) => {
    try {
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.4,
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
  const handleOpenUploadModal = (recordIdToPreselect?: string | unknown) => {
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
    const preselect = typeof recordIdToPreselect === 'string' ? recordIdToPreselect : undefined;
    if (preselect && consultations.some((c) => c.id === preselect)) {
      setSelectedRecordId(preselect);
    } else if (selectedRecordFilter !== 'ALL' && consultations.some((c) => c.id === selectedRecordFilter)) {
      setSelectedRecordId(selectedRecordFilter);
    } else if (!selectedRecordId || !consultations.some((c) => c.id === selectedRecordId)) {
      setSelectedRecordId(consultations[0].id);
    }
    setIsUploadModalVisible(true);
  };

  // ── Reset Upload Form ──
  const resetUploadForm = () => {
    if (selectedRecordFilter !== 'ALL' && consultations.some((c) => c.id === selectedRecordFilter)) {
      setSelectedRecordId(selectedRecordFilter);
    } else if (consultations.length > 0) {
      setSelectedRecordId(consultations[0].id);
    } else {
      setSelectedRecordId('');
    }
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

      // Prepare multipart/form-data payload as required by POST /api/records/{recordId}/upload-report
      const formData = new FormData();
      formData.append('file', {
        uri: selectedImage.uri,
        name: cleanFileName || `report_${Date.now()}.jpg`,
        type: selectedImage.type || 'image/jpeg',
      } as any);
      formData.append('type', finalReportType);

      // Submit to backend API: POST /api/records/{recordId}/upload-report
      const response = await fetch(
        `${apiUrl}/api/records/${encodeURIComponent(selectedRecordId)}/upload-report`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Cookie: `session_token=${token}`,
          },
          body: formData,
        }
      );

      const responseJson = await response.json().catch(() => null);

      if (!response.ok || responseJson?.success === false) {
        const errorMsg =
          responseJson?.message ||
          responseJson?.error?.message ||
          responseJson?.error ||
          `Server returned HTTP ${response.status} during upload.`;
        throw new Error(errorMsg);
      }

      // Persist local file:// URI in AsyncStorage with lightweight per-report key
      if (selectedImage.uri) {
        try {
          const uploadedReport = responseJson?.data?.report || responseJson?.data;
          if (uploadedReport?.id) {
            await AsyncStorage.setItem(
              `${REPORT_URI_CACHE_PREFIX}${uploadedReport.id}`,
              selectedImage.uri
            );
          }
        } catch (cacheErr) {
          console.warn('Local cache write error:', cacheErr);
        }
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

  // ── Render Consultation Visit Card (Timeline Item) ──
  const renderVisitCard = ({ item }: { item: ConsultationVisit }) => {
    const isDoctorPrefixed = item.doctorName.startsWith('Dr');
    const displayDoc = isDoctorPrefixed ? item.doctorName : `Dr. ${item.doctorName}`;
    const formattedDate = formatDate(item.visitDate);
    const formattedTime = formatTime(item.visitDate);
    const hasPrescription = !!(item.prescription?.items?.length || item.prescriptionNotes);

    return (
      <View style={styles.visitCard}>
        {/* Visit Card Header */}
        <View style={styles.visitCardHeader}>
          <View style={styles.visitDoctorAvatar}>
            <FontAwesome5 name="user-md" size={22} color="#3B6E5C" />
          </View>

          <View style={styles.visitDoctorInfo}>
            <Text style={styles.visitDoctorName} numberOfLines={1}>
              {displayDoc}
            </Text>
            <View style={styles.visitTimeRow}>
              <Ionicons name="calendar-outline" size={13} color="#4A5952" />
              <Text style={styles.visitTimeText}>
                {formattedDate} {formattedTime ? `• ${formattedTime}` : ''}
              </Text>
            </View>
          </View>

          {/* Record ID Badge */}
          <View style={styles.visitRecordBadge}>
            <Text style={styles.visitRecordBadgeText}>
              #{item.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Diagnosis Highlight */}
        <View style={styles.visitDiagnosisBox}>
          <View style={styles.diagnosisLabelRow}>
            <Ionicons name="pulse" size={15} color="#2A8567" style={{ marginRight: 6 }} />
            <Text style={styles.diagnosisLabel}>Clinical Diagnosis</Text>
          </View>
          <Text style={styles.diagnosisValue}>
            {item.diagnosis || 'General Clinical Consultation'}
          </Text>
        </View>

        {/* Symptoms Section */}
        {item.symptoms ? (
          <View style={styles.visitClinicalRow}>
            <Ionicons name="bandage-outline" size={15} color="#3B6E5C" style={styles.clinicalIcon} />
            <View style={styles.clinicalContentWrap}>
              <Text style={styles.clinicalTitle}>Reported Symptoms:</Text>
              <Text style={styles.clinicalText}>{item.symptoms}</Text>
            </View>
          </View>
        ) : null}

        {/* Treatment Plan Section */}
        {item.treatmentPlan ? (
          <View style={styles.visitClinicalRow}>
            <Ionicons name="medkit-outline" size={15} color="#3B6E5C" style={styles.clinicalIcon} />
            <View style={styles.clinicalContentWrap}>
              <Text style={styles.clinicalTitle}>Treatment Plan:</Text>
              <Text style={styles.clinicalText}>{item.treatmentPlan}</Text>
            </View>
          </View>
        ) : null}

        {/* Prescription Box */}
        {hasPrescription ? (
          <View style={styles.visitPrescriptionBox}>
            <View style={styles.prescriptionHeaderRow}>
              <FontAwesome5 name="pills" size={13} color="#3B6E5C" style={{ marginRight: 6 }} />
              <Text style={styles.prescriptionHeaderTitle}>Prescribed Medication</Text>
            </View>

            {item.prescription?.items && item.prescription.items.length > 0 ? (
              <View style={styles.prescriptionItemsList}>
                {item.prescription.items.map((med, idx) => (
                  <View key={med.id || idx} style={styles.prescriptionItemRow}>
                    <View style={styles.bulletDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medNameText}>
                        {med.medicine_name}{' '}
                        {med.dosage ? <Text style={styles.medDosageText}>({med.dosage})</Text> : null}
                      </Text>
                      {med.frequency || med.duration ? (
                        <Text style={styles.medFrequencyText}>
                          {[med.frequency, med.duration].filter(Boolean).join(' • ')}
                        </Text>
                      ) : null}
                      {med.instructions ? (
                        <Text style={styles.medInstructionText}>
                          Note: {med.instructions}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {item.prescriptionNotes ? (
              <Text style={styles.prescriptionNotesText}>
                Doctor's Note: {item.prescriptionNotes}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Follow-up Date */}
        {item.followUpDate ? (
          <View style={styles.followUpRow}>
            <Ionicons name="alarm-outline" size={15} color="#92400E" style={{ marginRight: 6 }} />
            <Text style={styles.followUpText}>
              Recommended Follow-Up: <Text style={styles.boldText}>{formatDate(item.followUpDate)}</Text>
            </Text>
          </View>
        ) : null}

        {/* Attached Reports Status & Actions */}
        <View style={styles.visitCardBottomRow}>
          {item.reportsCount > 0 ? (
            <TouchableOpacity
              style={styles.viewReportsAttachedBtn}
              onPress={() => {
                setSelectedRecordFilter(item.id);
                setActiveSegment('REPORTS');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="document-text" size={14} color="#2A8567" style={{ marginRight: 5 }} />
              <Text style={styles.viewReportsAttachedText}>
                {item.reportsCount} Diagnostic {item.reportsCount === 1 ? 'Report' : 'Reports'} Attached
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#2A8567" />
            </TouchableOpacity>
          ) : (
            <View style={styles.noReportsPill}>
              <Ionicons name="document-outline" size={13} color="#65776F" style={{ marginRight: 4 }} />
              <Text style={styles.noReportsPillText}>No reports attached</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.visitUploadReportBtn}
            onPress={() => handleOpenUploadModal(item.id)}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-upload-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.visitUploadReportBtnText}>Attach Report</Text>
          </TouchableOpacity>
        </View>

        {/* Medical Certificate Request Action */}
        <TouchableOpacity
          style={styles.visitCertificateBtn}
          onPress={() => {
            router.push({
              pathname: '/academic-submission',
              params: { recordId: item.id },
            } as any);
          }}
          activeOpacity={0.8}
        >
          <View style={styles.visitCertificateBtnContent}>
            <MaterialCommunityIcons name="certificate-outline" size={16} color="#3B6E5C" style={{ marginRight: 6 }} />
            <Text style={styles.visitCertificateBtnText}>Request Medical Certificate</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="#3B6E5C" />
        </TouchableOpacity>
      </View>
    );
  };

  // ── Render Diagnostic Report Card ──
  const renderReportCard = ({ item }: { item: MedicalReportItem }) => {
    const typeMeta = resolveReportTypeMeta(item.type);
    const isOpening = openingReportId === item.id;
    const isDownloading = downloadingReportId === item.id;
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
          {/* Explicit Record ID Display */}
          <View style={styles.consultationDetailRow}>
            <Ionicons name="document-text-outline" size={14} color="#3B6E5C" style={styles.metaIcon} />
            <Text style={styles.consultationDetailText}>
              Record ID: <Text style={styles.recordIdHighlight}>#{item.record_id ? item.record_id.slice(0, 8).toUpperCase() : 'N/A'}</Text>
            </Text>
          </View>

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

        {/* Action Buttons: View & Download side-by-side */}
        <View style={styles.cardActionsRow}>
          <TouchableOpacity
            style={styles.viewCardButton}
            onPress={() => handleViewReport(item)}
            disabled={isOpening || isDownloading}
            activeOpacity={0.8}
          >
            {isOpening ? (
              <ActivityIndicator size="small" color="#3B6E5C" />
            ) : (
              <>
                <Ionicons name="eye-outline" size={17} color="#3B6E5C" />
                <Text style={styles.viewCardButtonText}>View Report</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.downloadCardButton}
            onPress={() => handleDownloadReport(item)}
            disabled={isOpening || isDownloading}
            activeOpacity={0.8}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="download-outline" size={17} color="#FFFFFF" />
                <Text style={styles.downloadCardButtonText}>Download</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Render Empty State for Reports ──
  const renderEmptyReportsState = () => {
    if (isLoading || errorMessage) return null;

    if (selectedRecordFilter !== 'ALL') {
      const matchingConsultation = consultations.find((c) => c.id === selectedRecordFilter);
      const docName = matchingConsultation?.doctorName
        ? matchingConsultation.doctorName.startsWith('Dr')
          ? matchingConsultation.doctorName
          : `Dr. ${matchingConsultation.doctorName}`
        : 'this consultation';

      return (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <MaterialCommunityIcons name="file-document-outline" size={38} color="#3B6E5C" />
          </View>
          <Text style={styles.emptyTitle}>No Reports Attached to This Record</Text>
          <Text style={styles.emptyDescription}>
            No medical reports have been uploaded under consultation #{selectedRecordFilter.slice(0, 8).toUpperCase()} with {docName}.
          </Text>
          <TouchableOpacity
            style={styles.emptyActionButton}
            onPress={() => handleOpenUploadModal(selectedRecordFilter)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.emptyActionButtonText}>Upload Report for This Record</Text>
          </TouchableOpacity>
        </View>
      );
    }

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
          onPress={() => handleOpenUploadModal()}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.emptyActionButtonText}>Upload Medical Report</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Render Empty State for Consultation Visits ──
  const renderVisitsEmptyState = () => {
    if (isLoading || errorMessage) return null;
    return (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIconCircle}>
          <FontAwesome5 name="clinic-medical" size={32} color="#3B6E5C" />
        </View>
        <Text style={styles.emptyTitle}>No Consultation History Found</Text>
        <Text style={styles.emptyDescription}>
          You have not completed any clinical doctor consultations or medical center visits on your student file yet.
        </Text>
        <TouchableOpacity
          style={styles.emptyActionButton}
          onPress={() => router.push('/(tabs)/appointment' as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.emptyActionButtonText}>Book Doctor Consultation</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#D5E6DC" />

      {/* ── TOP HEADER WITH BACK BUTTON & SUMMARY ── */}
      <View style={styles.header}>
        <View style={styles.headerNavRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)' as any);
              }
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color="#16211C" />
          </TouchableOpacity>

          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitleText}>Medical Records</Text>
            <Text style={styles.headerSubtitleText}>
              Consultations, clinical diagnoses & diagnostic reports
            </Text>
          </View>
        </View>

        {/* ── SUMMARY STATS BAR & QUICK UPLOAD CTA ── */}
        <View style={styles.statsCardContainer}>
          <View style={styles.statsCol}>
            <Text style={styles.statsCountNumber}>{visits.length}</Text>
            <Text style={styles.statsCountLabel}>Visits</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsCol}>
            <Text style={styles.statsCountNumber}>{reports.length}</Text>
            <Text style={styles.statsCountLabel}>Reports</Text>
          </View>

          <TouchableOpacity
            style={styles.headerUploadCta}
            onPress={() => handleOpenUploadModal()}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-upload-outline" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.headerUploadCtaText}>Upload Report</Text>
          </TouchableOpacity>
        </View>

        {/* ── 2-TAB SEGMENTED SELECTOR: CONSULTATIONS vs REPORTS ── */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeSegment === 'VISITS' && styles.segmentBtnActive]}
            onPress={() => setActiveSegment('VISITS')}
            activeOpacity={0.85}
          >
            <FontAwesome5
              name="stethoscope"
              size={13}
              color={activeSegment === 'VISITS' ? '#FFFFFF' : '#3B6E5C'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentBtnText, activeSegment === 'VISITS' && styles.segmentBtnTextActive]}>
              Consultations ({visits.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeSegment === 'REPORTS' && styles.segmentBtnActive]}
            onPress={() => setActiveSegment('REPORTS')}
            activeOpacity={0.85}
          >
            <Ionicons
              name={activeSegment === 'REPORTS' ? 'document-text' : 'document-text-outline'}
              size={15}
              color={activeSegment === 'REPORTS' ? '#FFFFFF' : '#3B6E5C'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentBtnText, activeSegment === 'REPORTS' && styles.segmentBtnTextActive]}>
              Diagnostic Reports ({reports.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── MAIN SURFACE ── */}
      <View style={styles.surface}>
        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#3B6E5C" />
            <Text style={styles.loaderLabel}>
              {activeSegment === 'VISITS'
                ? 'Loading consultation visits...'
                : 'Loading medical reports...'}
            </Text>
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
        ) : activeSegment === 'VISITS' ? (
          /* ── TAB 1: CONSULTATION VISITS LIST ── */
          <FlatList
            data={visits}
            keyExtractor={(item) => item.id}
            renderItem={renderVisitCard}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderVisitsEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={loadMedicalRecords}
                tintColor="#3B6E5C"
                colors={['#3B6E5C']}
              />
            }
          />
        ) : (
          /* ── TAB 2: DIAGNOSTIC REPORTS LIST ── */
          <>
            {/* Consultation Record Filter chips (for Reports) */}
            {consultations.length > 0 && (
              <View style={styles.recordFilterSection}>
                <View style={styles.recordFilterHeaderRow}>
                  <View style={styles.recordFilterTitleWrap}>
                    <Ionicons name="git-branch-outline" size={14} color="#3B6E5C" style={{ marginRight: 5 }} />
                    <Text style={styles.recordFilterLabel}>Filter by Consultation Record</Text>
                  </View>
                  {selectedRecordFilter !== 'ALL' && (
                    <TouchableOpacity
                      onPress={() => setSelectedRecordFilter('ALL')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.clearRecordFilterText}>Show All Records</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recordFilterScroll}
                >
                  <TouchableOpacity
                    style={[
                      styles.recordFilterChip,
                      selectedRecordFilter === 'ALL' && styles.recordFilterChipActive,
                    ]}
                    onPress={() => setSelectedRecordFilter('ALL')}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name="layers-outline"
                      size={13}
                      color={selectedRecordFilter === 'ALL' ? '#FFFFFF' : '#3B6E5C'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.recordFilterChipText,
                        selectedRecordFilter === 'ALL' && styles.recordFilterChipTextActive,
                      ]}
                    >
                      All Medical Records ({reports.length})
                    </Text>
                  </TouchableOpacity>

                  {consultations.map((c) => {
                    const isSelected = selectedRecordFilter === c.id;
                    const count = reports.filter((r) => r.record_id === c.id).length;
                    const cleanDoc = c.doctorName.replace(/^Dr\.?\s*/i, '');
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.recordFilterChip,
                          isSelected && styles.recordFilterChipActive,
                        ]}
                        onPress={() => setSelectedRecordFilter(c.id)}
                        activeOpacity={0.75}
                      >
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'document-text-outline'}
                          size={13}
                          color={isSelected ? '#FFFFFF' : '#3B6E5C'}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={[
                            styles.recordFilterChipText,
                            isSelected && styles.recordFilterChipTextActive,
                          ]}
                        >
                          Dr. {cleanDoc} ({formatDate(c.visitDate)}) - #{c.id.slice(0, 6).toUpperCase()} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Category Filter Chips Bar */}
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

            {/* Reports Content List */}
            <FlatList
              data={filteredReports}
              keyExtractor={(item) => item.id}
              renderItem={renderReportCard}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={renderEmptyReportsState}
              refreshControl={
                <RefreshControl
                  refreshing={isLoading}
                  onRefresh={loadMedicalRecords}
                  tintColor="#3B6E5C"
                  colors={['#3B6E5C']}
                />
              }
            />
          </>
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
              {/* STEP 1: Select Medical Record / Consultation (record_id) */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>
                  1. Select Medical Record / Consultation (record_id) <Text style={styles.requiredStar}>*</Text>
                </Text>
                <Text style={styles.formHint}>
                  Reports must be linked to a consultation record with the medical staff. Your attending doctor will receive this report.
                </Text>

                {consultations.length === 0 ? (
                  <View style={styles.warningCallout}>
                    <Ionicons name="warning-outline" size={18} color="#A65E18" />
                    <Text style={styles.warningCalloutText}>
                      No clinical consultation records found on your account.
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
                          <View style={styles.consultationOptionHeader}>
                            <View
                              style={[
                                styles.recordIdBadge,
                                isSelected && styles.recordIdBadgeActive,
                              ]}
                            >
                              <Ionicons
                                name="document-text-outline"
                                size={12}
                                color={isSelected ? '#2A8567' : '#4A5952'}
                                style={{ marginRight: 4 }}
                              />
                              <Text
                                style={[
                                  styles.recordIdBadgeText,
                                  isSelected && styles.recordIdBadgeTextActive,
                                ]}
                              >
                                Record ID: #{c.id.slice(0, 8).toUpperCase()}
                              </Text>
                            </View>

                            <View style={styles.consultationOptionCheck}>
                              {isSelected ? (
                                <Ionicons name="checkmark-circle" size={20} color="#3B6E5C" />
                              ) : (
                                <Ionicons name="radio-button-off" size={18} color="#9BB5A9" />
                              )}
                            </View>
                          </View>

                          <View style={styles.consultationOptionBody}>
                            <Text style={styles.consultationOptionDoctor} numberOfLines={1}>
                              {c.doctorName.startsWith('Dr') ? c.doctorName : `Dr. ${c.doctorName}`} • {formatDate(c.visitDate)}
                            </Text>
                            <Text style={styles.consultationOptionDiagnosis} numberOfLines={1}>
                              Diagnosis: <Text style={styles.boldText}>{c.diagnosis || 'Clinical Consultation'}</Text>
                            </Text>
                            {c.symptoms ? (
                              <Text style={styles.consultationOptionSymptoms} numberOfLines={1}>
                                Symptoms: {c.symptoms}
                              </Text>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Selected Record ID Confirmation Banner */}
                    {selectedRecordId ? (
                      <View style={styles.selectedRecordConfirmBox}>
                        <Ionicons name="link" size={15} color="#2A8567" style={{ marginRight: 6 }} />
                        <Text style={styles.selectedRecordConfirmText}>
                          Selected Record ID: <Text style={styles.selectedRecordIdBold}>#{selectedRecordId.slice(0, 8).toUpperCase()}</Text>
                        </Text>
                      </View>
                    ) : null}
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
        onRequestClose={() => {
          setPreviewUri(null);
          setCurrentPreviewItem(null);
        }}
      >
        <SafeAreaView style={styles.previewBackdrop}>
          <View style={styles.previewHeaderBar}>
            <Text style={styles.previewHeaderTitle} numberOfLines={1}>
              {previewTitle || 'Report Preview'}
            </Text>

            <View style={styles.previewHeaderActions}>
              {currentPreviewItem && (
                <TouchableOpacity
                  style={styles.previewDownloadBtn}
                  onPress={() => {
                    if (currentPreviewItem) {
                      void handleDownloadReport(currentPreviewItem);
                    }
                  }}
                  activeOpacity={0.8}
                  disabled={downloadingReportId === currentPreviewItem.id}
                >
                  {downloadingReportId === currentPreviewItem.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.previewDownloadBtnText}>Save</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.previewCloseBtn}
                onPress={() => {
                  setPreviewUri(null);
                  setCurrentPreviewItem(null);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
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

          {/* Bottom Action Bar in Preview Modal */}
          {currentPreviewItem && (
            <View style={styles.previewBottomBar}>
              <TouchableOpacity
                style={styles.previewBottomDownloadBtn}
                onPress={() => {
                  if (currentPreviewItem) {
                    void handleDownloadReport(currentPreviewItem);
                  }
                }}
                activeOpacity={0.8}
                disabled={downloadingReportId === currentPreviewItem.id}
              >
                {downloadingReportId === currentPreviewItem.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.previewBottomDownloadBtnText}>Download / Save Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
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
    marginBottom: 12,
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
  statsCol: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  statsDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#D1E3D8',
  },
  statsCountNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#16211C',
  },
  statsCountLabel: {
    fontSize: 11,
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
  // ── Segmented Control ──
  segmentContainer: {
    marginTop: 12,
    flexDirection: 'row',
    backgroundColor: '#C5DFD0',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: '#3B6E5C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2D5648',
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
  },
  surface: {
    flex: 1,
    backgroundColor: '#EAF3ED',
  },
  // ── Visit Card Styles ──
  visitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D1E3D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  visitCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  visitDoctorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E2F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitDoctorInfo: {
    flex: 1,
  },
  visitDoctorName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16211C',
  },
  visitTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  visitTimeText: {
    fontSize: 12,
    color: '#4A5952',
    fontWeight: '500',
  },
  visitRecordBadge: {
    backgroundColor: '#EAF3ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1E3D8',
  },
  visitRecordBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2A8567',
    letterSpacing: 0.3,
  },
  visitDiagnosisBox: {
    backgroundColor: '#EBF6EF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D2EADB',
  },
  diagnosisLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  diagnosisLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2A8567',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  diagnosisValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16211C',
  },
  visitClinicalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 4,
    gap: 8,
  },
  clinicalIcon: {
    marginTop: 2,
  },
  clinicalContentWrap: {
    flex: 1,
  },
  clinicalTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B6E5C',
  },
  clinicalText: {
    fontSize: 13,
    color: '#16211C',
    lineHeight: 18,
    marginTop: 1,
  },
  visitPrescriptionBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2EDE6',
  },
  prescriptionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  prescriptionHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B6E5C',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  prescriptionItemsList: {
    gap: 6,
  },
  prescriptionItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B6E5C',
    marginTop: 6,
  },
  medNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16211C',
  },
  medDosageText: {
    color: '#3B6E5C',
    fontWeight: '600',
  },
  medFrequencyText: {
    fontSize: 12,
    color: '#4A5952',
    marginTop: 1,
  },
  medInstructionText: {
    fontSize: 11,
    color: '#65776F',
    fontStyle: 'italic',
    marginTop: 1,
  },
  prescriptionNotesText: {
    fontSize: 12,
    color: '#4A5952',
    fontStyle: 'italic',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2EDE6',
  },
  followUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 10,
  },
  followUpText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
  },
  visitCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2EDE6',
    gap: 10,
  },
  viewReportsAttachedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2F5E9',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#C3E7D3',
  },
  viewReportsAttachedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2A8567',
    flex: 1,
  },
  noReportsPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  noReportsPillText: {
    fontSize: 12,
    color: '#65776F',
  },
  visitUploadReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  visitUploadReportBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  visitCertificateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EAF3ED',
    borderWidth: 1,
    borderColor: '#DCECE2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  visitCertificateBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  visitCertificateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B6E5C',
  },
  // ── Diagnostic Reports Styles ──
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
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  viewCardButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#3B6E5C',
    borderRadius: 22,
    paddingVertical: 10,
    gap: 6,
  },
  viewCardButtonText: {
    color: '#3B6E5C',
    fontSize: 14,
    fontWeight: '700',
  },
  downloadCardButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 22,
    paddingVertical: 10,
    gap: 6,
    shadowColor: '#3B6E5C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  downloadCardButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  previewHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  previewDownloadBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
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
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAF9',
    borderWidth: 1.5,
    borderColor: '#D1E3D8',
    marginBottom: 2,
  },
  consultationOptionCardActive: {
    backgroundColor: '#E2F5E9',
    borderColor: '#3B6E5C',
  },
  consultationOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recordIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF3ED',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1E3D8',
  },
  recordIdBadgeActive: {
    backgroundColor: '#C3E7D3',
    borderColor: '#2A8567',
  },
  recordIdBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A5952',
    letterSpacing: 0.2,
  },
  recordIdBadgeTextActive: {
    color: '#2A8567',
  },
  recordIdHighlight: {
    fontWeight: '700',
    color: '#2A8567',
    letterSpacing: 0.2,
  },
  consultationOptionCheck: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  consultationOptionBody: {
    gap: 3,
  },
  consultationOptionDoctor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16211C',
  },
  consultationOptionDiagnosis: {
    fontSize: 12,
    color: '#4A5952',
  },
  consultationOptionSymptoms: {
    fontSize: 11,
    color: '#65776F',
  },
  selectedRecordConfirmBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2F5E9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#C3E7D3',
  },
  selectedRecordConfirmText: {
    fontSize: 12,
    color: '#2A8567',
    fontWeight: '600',
    flex: 1,
  },
  selectedRecordIdBold: {
    fontWeight: '800',
    color: '#16211C',
  },
  recordFilterSection: {
    backgroundColor: '#EAF3ED',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  recordFilterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recordFilterTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordFilterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B6E5C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearRecordFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B6E5C',
    textDecorationLine: 'underline',
  },
  recordFilterScroll: {
    paddingBottom: 8,
    gap: 8,
  },
  recordFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1E3D8',
  },
  recordFilterChipActive: {
    backgroundColor: '#3B6E5C',
    borderColor: '#3B6E5C',
  },
  recordFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5952',
  },
  recordFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  previewBottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
  previewBottomDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 24,
    paddingVertical: 14,
    gap: 8,
  },
  previewBottomDownloadBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
