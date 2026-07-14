import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

type PrescriptionCard = {
  id: string;
  dateLabel: string;
  doctorName: string;
  diagnosis: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
  }>;
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

const getPrescriptionMedications = (item: PrescriptionApiItem): PrescriptionMedication[] => {
  if (Array.isArray(item.medications)) return item.medications;
  if (Array.isArray(item.items)) return item.items;
  if (Array.isArray(item.prescription?.items)) return item.prescription.items;
  return [];
};

const normalizePrescriptions = (payload: any): PrescriptionCard[] => {
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
      const medications = getPrescriptionMedications(item).map((medication, medicationIndex) => ({
        name: getMedicationName(medication, medicationIndex),
        dosage: medication.dosage?.trim() || 'Dosage unavailable',
        frequency: getMedicationFrequency(medication),
      }));

      return {
        id: String(item.prescription?.id || item.id || `prescription-${index}`),
        dateLabel: formatDate(item.visit_date_time || item.date || item.visit_date || item.created_at),
        doctorName:
          item.doctor_name ||
          item.doctor?.staff?.user?.name ||
          item.doctor?.name ||
          'Assigned Doctor',
        diagnosis: item.diagnosis?.trim() || 'Not specified',
        medications,
      };
    });
};

export default function PrescriptionsScreen() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

      console.log('Attempting to fetch from:', apiUrl);

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

  const renderPrescriptionCard = ({ item }: { item: PrescriptionCard }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconBubble}>
            <MaterialCommunityIcons name="pill" size={22} color="#1D4ED8" />
          </View>

          <View style={styles.headerTextWrap}>
            <Text style={styles.cardDoctorName}>{item.doctorName}</Text>
            <Text style={styles.cardDate}>{item.dateLabel}</Text>
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>Diagnosis</Text>
          <Text style={styles.sectionValue}>{item.diagnosis}</Text>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>Medications</Text>
          {item.medications.length > 0 ? (
            <View style={styles.medicationList}>
              {item.medications.map((medication, index) => (
                <View key={`${item.id}-medication-${index}`} style={styles.medicationRow}>
                  <View style={styles.medicationIndexBadge}>
                    <Text style={styles.medicationIndexText}>{index + 1}</Text>
                  </View>

                  <View style={styles.medicationContent}>
                    <Text style={styles.medicationName}>{medication.name}</Text>
                    <Text style={styles.medicationMeta}>Dosage: {medication.dosage}</Text>
                    <Text style={styles.medicationMeta}>Frequency: {medication.frequency}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.inlineEmptyText}>No medications listed.</Text>
          )}
        </View>
      </View>
    );
  };

  const renderEmptyState = () => {
    if (errorMessage) return null;

    return (
      <View style={styles.stateCard}>
        <View style={styles.stateIconBubble}>
          <Ionicons name="document-text-outline" size={28} color="#1D4ED8" />
        </View>
        <Text style={styles.stateTitle}>No prescriptions found</Text>
        <Text style={styles.stateBody}>
          Once a doctor issues a prescription, it will appear here with the treatment details and medications.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF1F8" />

      <View style={styles.header}>
        <View style={styles.badge}>
          <Ionicons name="medical-outline" size={16} color="#1D4ED8" />
          <Text style={styles.badgeText}>Patient Records</Text>
        </View>
        <Text style={styles.title}>Prescriptions</Text>
        <Text style={styles.subtitle}>
          Review doctor-issued prescriptions, diagnosis notes, and medication instructions in one place.
        </Text>
      </View>

      <View style={styles.surface}>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#1D4ED8" />
            <Text style={styles.loadingText}>Loading prescriptions...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.stateCard}>
            <View style={[styles.stateIconBubble, styles.errorIconBubble]}>
              <Ionicons name="alert-circle-outline" size={28} color="#DC2626" />
            </View>
            <Text style={styles.stateTitle}>Backend Connection Failed</Text>
            <Text style={styles.stateBody}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadPrescriptions} activeOpacity={0.85}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={prescriptions}
            keyExtractor={(item) => item.id}
            renderItem={renderPrescriptionCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={loadPrescriptions} tintColor="#1D4ED8" />
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
    backgroundColor: '#EAF1F8',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#EAF1F8',
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#D7E3F0',
  },
  badgeText: {
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  title: {
    color: '#0F172A',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
  },
  surface: {
    flex: 1,
    backgroundColor: '#F7FAFD',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#1E3A8A',
    fontSize: 15,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  cardDoctorName: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDate: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  sectionValue: {
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 22,
  },
  medicationList: {
    gap: 10,
  },
  medicationRow: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  medicationIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  medicationIndexText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
  },
  medicationContent: {
    flex: 1,
  },
  medicationName: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  medicationMeta: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  inlineEmptyText: {
    color: '#64748B',
    fontSize: 14,
    fontStyle: 'italic',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    marginHorizontal: 20,
    marginTop: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  stateIconBubble: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorIconBubble: {
    backgroundColor: '#FEE2E2',
  },
  stateTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  stateBody: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});