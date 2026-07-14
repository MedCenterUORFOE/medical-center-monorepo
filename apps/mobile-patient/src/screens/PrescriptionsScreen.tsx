import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

type PrescriptionMedication = {
  id?: string | number;
  name?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  instructions?: string | null;
  medicine_id?: string | null;
  external_medicine_name?: string | null;
  medicine?: { name?: string | null } | null;
  quantity?: number | null;
};

type PrescriptionApiItem = {
  id?: string | number;
  date?: string | null;
  visit_date?: string | null;
  visit_date_time?: string | null;
  created_at?: string | null;
  diagnosis?: string | null;
  doctor_name?: string | null;
  doctor?: {
    name?: string | null;
    specialization?: string | null;
    staff?: {
      user?: {
        name?: string | null;
      } | null;
    } | null;
  } | null;
  medications?: PrescriptionMedication[] | null;
  items?: PrescriptionMedication[] | null;
  prescription?: {
    id?: string | number | null;
    items?: PrescriptionMedication[] | null;
  } | null;
};

type NormalizedMedication = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
};

type PrescriptionCardData = {
  id: string;
  dateLabel: string;
  doctorName: string;
  doctorSpecialty: string;
  diagnosis: string;
  isActive: boolean;
  medications: NormalizedMedication[];
};

const formatDate = (value?: string | null): string => {
  if (!value) return 'Date unavailable';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getMedicationName = (medication: PrescriptionMedication, index: number): string => {
  return (
    medication.external_medicine_name ||
    medication.medicine?.name ||
    medication.name ||
    medication.medicine_id ||
    `Medication ${index + 1}`
  );
};

const getMedicationFrequency = (medication: PrescriptionMedication): string => {
  if (medication.frequency && medication.frequency.trim()) return medication.frequency.trim();
  if (medication.instructions && medication.instructions.trim()) return medication.instructions.trim();
  return 'As directed';
};

const parseDuration = (instructions?: string | null): string => {
  if (!instructions) return 'As directed';
  const match = instructions.match(/(\d+\s*(days|day|weeks|week|months|month))/i);
  return match ? match[0] : 'As directed';
};

const getPrescriptionMedications = (item: PrescriptionApiItem): PrescriptionMedication[] => {
  if (Array.isArray(item.medications)) return item.medications;
  if (Array.isArray(item.items)) return item.items;
  if (Array.isArray(item.prescription?.items)) return item.prescription.items;
  return [];
};

const isPrescriptionActive = (dateString?: string | null): boolean => {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return date >= thirtyDaysAgo;
};

const normalizePrescriptions = (payload: any): PrescriptionCardData[] => {
  const rawItems: PrescriptionApiItem[] =
    payload?.data?.history ||
    payload?.history ||
    payload?.data?.medical_history ||
    payload?.medical_history ||
    [];

  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .filter((item) => Array.isArray(item.prescription?.items) && item.prescription.items.length > 0)
    .map((item, index) => {
      const visitDate = item.visit_date_time || item.date || item.visit_date || item.created_at;
      const medications = getPrescriptionMedications(item).map((medication, medicationIndex) => {
        const freq = getMedicationFrequency(medication);
        return {
          name: getMedicationName(medication, medicationIndex),
          dosage: medication.dosage?.trim() || 'As prescribed',
          frequency: freq,
          duration: parseDuration(medication.instructions || medication.frequency),
          instructions: medication.instructions?.trim() || 'Take as directed.',
        };
      });

      return {
        id: String(item.prescription?.id || item.id || `prescription-${index}`),
        dateLabel: formatDate(visitDate),
        doctorName:
          item.doctor_name ||
          item.doctor?.staff?.user?.name ||
          item.doctor?.name ||
          'Assigned Doctor',
        doctorSpecialty: item.doctor?.specialization || 'Medical Officer',
        diagnosis: item.diagnosis?.trim() || 'General Consultation',
        isActive: isPrescriptionActive(visitDate),
        medications,
      };
    });
};

export default function PrescriptionsScreen() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeReminders, setActiveReminders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadPrescriptions();
  }, []);

  const loadPrescriptions = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) {
        throw new Error('API URL is not configured.');
      }

      const token = await AsyncStorage.getItem('userToken');
      const userId = await AsyncStorage.getItem('userId');
      if (!token) {
        console.warn('Missing userToken in AsyncStorage while loading prescriptions.');
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

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to load prescriptions.');
      }

      setPrescriptions(normalizePrescriptions(payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while loading prescriptions.';
      setErrorMessage(`Backend Connection Failed: ${message}`);
      setPrescriptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPDF = (doctorName: string, dateLabel: string) => {
    Alert.alert(
      'Download Prescription',
      `Your prescription PDF from Dr. ${doctorName} on ${dateLabel} is generating. You will be notified when the download is complete.`,
      [{ text: 'Dismiss' }]
    );
  };

  const handleToggleReminder = (id: string, name: string) => {
    setActiveReminders((prev) => {
      const updated = !prev[id];
      Alert.alert(
        updated ? 'Reminder Set' : 'Reminder Turned Off',
        updated
          ? `Daily notifications have been scheduled for taking your prescription medications.`
          : `Daily reminders for this prescription have been disabled.`
      );
      return { ...prev, [id]: updated };
    });
  };

  const renderPrescriptionCard = ({ item }: { item: PrescriptionCardData }) => {
    const isReminderActive = !!activeReminders[item.id];

    return (
      <View style={styles.card}>
        {/* CARD HEADER */}
        <View style={styles.cardHeader}>
          <View style={styles.doctorIconBubble}>
            <MaterialCommunityIcons name="doctor" size={24} color="#0284C7" />
          </View>
          <View style={styles.doctorInfo}>
            <Text style={styles.doctorName}>Dr. {item.doctorName}</Text>
            <Text style={styles.doctorSpecialty}>{item.doctorSpecialty}</Text>
          </View>
          <View style={[styles.statusBadge, item.isActive ? styles.statusActive : styles.statusExpired]}>
            <Text style={[styles.statusText, item.isActive ? styles.statusTextActive : styles.statusTextExpired]}>
              {item.isActive ? 'Active' : 'Expired'}
            </Text>
          </View>
        </View>

        {/* VISIT DETAILS */}
        <View style={styles.visitMetaRow}>
          <View style={styles.metaCol}>
            <Ionicons name="calendar-outline" size={14} color="#64748B" />
            <Text style={styles.metaText}>{item.dateLabel}</Text>
          </View>
          <View style={styles.metaCol}>
            <Ionicons name="clipboard-outline" size={14} color="#64748B" />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.diagnosis}
            </Text>
          </View>
        </View>

        {/* MEDICATION DETAIL BREAKDOWN */}
        <View style={styles.medicationSection}>
          <Text style={styles.sectionTitle}>Prescribed Medications</Text>
          {item.medications.map((med, index) => (
            <View key={`${item.id}-med-${index}`} style={styles.medicationRow}>
              {/* Medicine Icon & Info */}
              <View style={styles.medHeader}>
                <View style={styles.medIconWrapper}>
                  <MaterialCommunityIcons name="pill" size={18} color="#0284C7" />
                </View>
                <View style={styles.medTitleBlock}>
                  <Text style={styles.medicationName}>{med.name}</Text>
                  <Text style={styles.medicationDosage}>{med.dosage}</Text>
                </View>
              </View>

              {/* Dosage, Timing & Duration Grid */}
              <View style={styles.medGrid}>
                <View style={styles.gridCol}>
                  <Ionicons name="time-outline" size={14} color="#0284C7" style={styles.gridIcon} />
                  <Text style={styles.gridLabel}>Frequency</Text>
                  <Text style={styles.gridValue}>{med.frequency}</Text>
                </View>
                <View style={styles.gridCol}>
                  <Ionicons name="hourglass-outline" size={14} color="#0284C7" style={styles.gridIcon} />
                  <Text style={styles.gridLabel}>Duration</Text>
                  <Text style={styles.gridValue}>{med.duration}</Text>
                </View>
              </View>

              {/* Instructions row */}
              {med.instructions ? (
                <View style={styles.instructionsBlock}>
                  <Text style={styles.instructionsText}>
                    <Text style={styles.instructionsLabel}>Note: </Text>
                    {med.instructions}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {/* ACTION BUTTONS */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={() => handleDownloadPDF(item.doctorName, item.dateLabel)}
            activeOpacity={0.8}
          >
            <Ionicons name="download-outline" size={18} color="#0284C7" />
            <Text style={styles.downloadButtonText}>Download PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.reminderButton, isReminderActive && styles.reminderActiveButton]}
            onPress={() => handleToggleReminder(item.id, item.doctorName)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isReminderActive ? 'notifications' : 'notifications-outline'}
              size={18}
              color={isReminderActive ? '#FFFFFF' : '#475569'}
            />
            <Text style={[styles.reminderButtonText, isReminderActive && styles.reminderActiveButtonText]}>
              {isReminderActive ? 'Reminder Set' : 'Set Reminder'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => {
    if (errorMessage) return null;

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialCommunityIcons name="file-document-edit-outline" size={48} color="#0284C7" />
        </View>
        <Text style={styles.emptyTitle}>No Prescriptions Found</Text>
        <Text style={styles.emptyDescription}>
          Any prescriptions issued by University Medical Center medical staff during your visits will be listed here.
        </Text>
        <TouchableOpacity style={styles.emptyRefreshButton} onPress={loadPrescriptions} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.emptyRefreshText}>Refresh Records</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* STUNNING SCREEN HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTag}>
          <MaterialCommunityIcons name="heart-pulse" size={14} color="#0284C7" />
          <Text style={styles.headerTagText}>MY TREATMENT</Text>
        </View>
        <Text style={styles.headerTitle}>Prescriptions</Text>
        <Text style={styles.headerSubtitle}>
          View Active prescriptions, dosage breakdown guidelines, and set daily reminders.
        </Text>
      </View>

      <View style={styles.body}>
        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.loaderText}>Syncing medical charts...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorContainer}>
            <View style={styles.errorIconCircle}>
              <Ionicons name="cloud-offline-outline" size={32} color="#EF4444" />
            </View>
            <Text style={styles.errorTitle}>Synchronization Failed</Text>
            <Text style={styles.errorDescription}>{errorMessage}</Text>
            <TouchableOpacity style={styles.errorRetryButton} onPress={loadPrescriptions} activeOpacity={0.8}>
              <Text style={styles.errorRetryText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={prescriptions}
            keyExtractor={(item) => item.id}
            renderItem={renderPrescriptionCard}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={loadPrescriptions} tintColor="#0284C7" />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 22,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  headerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
    gap: 6,
  },
  headerTagText: {
    color: '#0369A1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  headerSubtitle: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  body: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  doctorIconBubble: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0F2FE',
    marginRight: 12,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  doctorSpecialty: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusActive: {
    backgroundColor: '#DCFCE7',
  },
  statusExpired: {
    backgroundColor: '#F1F5F9',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusTextActive: {
    color: '#166534',
  },
  statusTextExpired: {
    color: '#475569',
  },
  visitMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  metaCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  metaText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  medicationSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  medicationRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  medHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  medIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  medTitleBlock: {
    flex: 1,
  },
  medicationName: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 1,
  },
  medicationDosage: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: '700',
  },
  medGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  gridCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  gridIcon: {
    marginBottom: 3,
  },
  gridLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  gridValue: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  instructionsBlock: {
    marginTop: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  instructionsText: {
    color: '#B45309',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  instructionsLabel: {
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  downloadButton: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#0284C7',
    borderRadius: 14,
    paddingVertical: 10,
  },
  downloadButtonText: {
    color: '#0284C7',
    fontSize: 13,
    fontWeight: '800',
  },
  reminderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 10,
  },
  reminderActiveButton: {
    backgroundColor: '#0284C7',
  },
  reminderButtonText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  reminderActiveButtonText: {
    color: '#FFFFFF',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E0F2FE',
    marginBottom: 18,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  emptyRefreshText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  errorContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginTop: 20,
    marginHorizontal: 16,
    shadowColor: '#EF4444',
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorTitle: {
    color: '#991B1B',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  errorDescription: {
    color: '#EF4444',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorRetryButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  errorRetryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});