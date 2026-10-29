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
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// ── Types ──
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
  source?: string | null;
};

type PrescriptionApiItem = {
  id?: string | number;
  patient_id?: string | null;
  date?: string | null;
  visit_date?: string | null;
  visit_date_time?: string | null;
  created_at?: string | null;
  symptoms?: string | null;
  diagnosis?: string | null;
  treatment_plan?: string | null;
  prescription_notes?: string | null;
  follow_up_date?: string | null;
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
    is_fulfilled?: boolean | null;
    items?: PrescriptionMedication[] | null;
  } | null;
};

type NormalizedMedication = {
  name: string;
  dosage: string;
  scheduleLines: string[];
  foodTiming: string | null;
  duration: string;
  quantity?: number | null;
  instructions: string;
};

type PrescriptionCardData = {
  id: string;
  patientId?: string | null;
  dateLabel: string;
  doctorName: string;
  doctorSpecialty: string;
  diagnosis: string;
  symptoms?: string | null;
  treatmentPlan?: string | null;
  prescriptionNotes?: string | null;
  followUpDate?: string | null;
  isActive: boolean;
  medications: NormalizedMedication[];
};

type PatientInfo = {
  name: string;
  studentId: string;
};

// ── Date Formatter (DD-MMM-YYYY) ──
const formatVisitDate = (value?: string | null): string => {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = parsed.toLocaleDateString('en-US', { month: 'short' });
  const year = parsed.getFullYear();
  return `${day}-${month}-${year}`;
};

// ── Clean Medication Name Helper ──
const cleanMedicationName = (medication: PrescriptionMedication, index: number): string => {
  if (medication.external_medicine_name && medication.external_medicine_name.trim()) {
    return medication.external_medicine_name.trim().toUpperCase();
  }
  if (medication.medicine?.name && medication.medicine.name.trim()) {
    return medication.medicine.name.trim().toUpperCase();
  }
  if (medication.name && medication.name.trim() && !medication.name.includes('-')) {
    return medication.name.trim().toUpperCase();
  }
  if (medication.source === 'INTERNAL' || (medication.medicine_id && medication.medicine_id.length > 20)) {
    return `INTERNAL STOCK MEDICINE #${index + 1}`;
  }
  if (medication.medicine_id) {
    return medication.medicine_id.toUpperCase();
  }
  return `MEDICATION #${index + 1}`;
};

// ── Smart Schedule & Food Timing Parser ──
interface ParsedSchedule {
  lines: string[];
  foodTiming: string | null;
}

const parseScheduleAndFoodTiming = (
  dosageStr?: string | null,
  instructionsStr?: string | null
): ParsedSchedule => {
  const dosage = (dosageStr || '').trim();
  const instructions = (instructionsStr || '').trim();
  const combined = `${dosage} ${instructions}`.toLowerCase();

  // 1. Food Timing Extraction
  let foodTiming: string | null = null;
  if (/after\s+(food|meal|meals|eating)|pc\b/i.test(combined)) {
    foodTiming = 'After Food';
  } else if (/before\s+(food|meal|meals|eating)|empty\s+stomach|ac\b/i.test(combined)) {
    foodTiming = 'Before Food';
  } else if (/with\s+(food|meal|meals|eating)/i.test(combined)) {
    foodTiming = 'With Meals';
  }

  // 2. Schedule Lines Extraction
  const lines: string[] = [];

  // Pattern: "1-0-1", "1/0/1", "1-1-1", "1-1-1-1"
  const dashPattern = /(\d+)\s*[-/]\s*(\d+)\s*[-/]\s*(\d+)(?:\s*[-/]\s*(\d+))?/;
  const dashMatch = dosage.match(dashPattern);
  if (dashMatch) {
    const m = parseInt(dashMatch[1], 10);
    const a = parseInt(dashMatch[2], 10);
    const eOrN = parseInt(dashMatch[3], 10);
    const fourth = dashMatch[4] ? parseInt(dashMatch[4], 10) : null;

    if (fourth !== null) {
      if (m > 0) lines.push(`Morning - ${m}`);
      if (a > 0) lines.push(`Afternoon - ${a}`);
      if (eOrN > 0) lines.push(`Evening - ${eOrN}`);
      if (fourth > 0) lines.push(`Night - ${fourth}`);
    } else {
      if (m > 0) lines.push(`Morning - ${m}`);
      if (a > 0) lines.push(`Afternoon - ${a}`);
      if (eOrN > 0) lines.push(`Night - ${eOrN}`);
    }
    if (lines.length > 0) {
      return { lines, foodTiming };
    }
  }

  // Pattern: Keywords like "1 Morning, 1 Night" or "1 Morn, 1 Aft, 1 Eve, 1 Night"
  const morningMatch =
    combined.match(/(\d+)\s*(?:tab(?:let)?s?|caps?|pills?)?\s*(?:in\s+the\s+)?morn(?:ing)?/i) ||
    combined.match(/morn(?:ing)?\s*[-:]?\s*(\d+)/i) ||
    combined.match(/\b(morn(?:ing)?)\b/i);
  const afternoonMatch =
    combined.match(/(\d+)\s*(?:tab(?:let)?s?|caps?|pills?)?\s*(?:in\s+the\s+)?(?:afternoon|noon|aft)/i) ||
    combined.match(/(?:afternoon|noon|aft)\s*[-:]?\s*(\d+)/i) ||
    combined.match(/\b(afternoon|noon|aft)\b/i);
  const eveningMatch =
    combined.match(/(\d+)\s*(?:tab(?:let)?s?|caps?|pills?)?\s*(?:in\s+the\s+)?eve(?:ning)?/i) ||
    combined.match(/eve(?:ning)?\s*[-:]?\s*(\d+)/i) ||
    combined.match(/\b(eve(?:ning)?)\b/i);
  const nightMatch =
    combined.match(/(\d+)\s*(?:tab(?:let)?s?|caps?|pills?)?\s*(?:at\s+)?(?:night|bedtime)/i) ||
    combined.match(/(?:night|bedtime)\s*[-:]?\s*(\d+)/i) ||
    combined.match(/\b(night|bedtime)\b/i);

  if (morningMatch || afternoonMatch || eveningMatch || nightMatch) {
    if (morningMatch) {
      const qty = morningMatch[1] && !isNaN(Number(morningMatch[1])) ? morningMatch[1] : '1';
      lines.push(`Morning - ${qty}`);
    }
    if (afternoonMatch) {
      const qty = afternoonMatch[1] && !isNaN(Number(afternoonMatch[1])) ? afternoonMatch[1] : '1';
      lines.push(`Afternoon - ${qty}`);
    }
    if (eveningMatch) {
      const qty = eveningMatch[1] && !isNaN(Number(eveningMatch[1])) ? eveningMatch[1] : '1';
      lines.push(`Evening - ${qty}`);
    }
    if (nightMatch) {
      const qty = nightMatch[1] && !isNaN(Number(nightMatch[1])) ? nightMatch[1] : '1';
      lines.push(`Night - ${qty}`);
    }
    if (lines.length > 0) {
      return { lines, foodTiming };
    }
  }

  // Medical Abbreviations: TDS / TID (3 times a day)
  if (/\b(tds|tid|thrice|3\s*times|three\s*times)\b/i.test(combined)) {
    const qtyMatch = combined.match(/^(\d+)\s*(?:tab|cap|pill)?/i) || combined.match(/(\d+)\s*(?:tab|cap|pill)/i);
    const qty = qtyMatch ? qtyMatch[1] : '1';
    lines.push(`Morning - ${qty}`);
    lines.push(`Afternoon - ${qty}`);
    lines.push(`Night - ${qty}`);
    return { lines, foodTiming };
  }

  // BD / BID (2 times a day)
  if (/\b(bd|bid|twice|2\s*times|two\s*times)\b/i.test(combined)) {
    const qtyMatch = combined.match(/^(\d+)\s*(?:tab|cap|pill)?/i) || combined.match(/(\d+)\s*(?:tab|cap|pill)/i);
    const qty = qtyMatch ? qtyMatch[1] : '1';
    lines.push(`Morning - ${qty}`);
    lines.push(`Night - ${qty}`);
    return { lines, foodTiming };
  }

  // QDS / QID (4 times a day)
  if (/\b(qds|qid|4\s*times|four\s*times)\b/i.test(combined)) {
    const qtyMatch = combined.match(/^(\d+)\s*(?:tab|cap|pill)?/i) || combined.match(/(\d+)\s*(?:tab|cap|pill)/i);
    const qty = qtyMatch ? qtyMatch[1] : '1';
    lines.push(`Morning - ${qty}`);
    lines.push(`Afternoon - ${qty}`);
    lines.push(`Evening - ${qty}`);
    lines.push(`Night - ${qty}`);
    return { lines, foodTiming };
  }

  // OD / QD / once daily / mane
  if (/\b(od|qd|once|1\s*time|one\s*time|daily|mane)\b/i.test(combined)) {
    const qtyMatch = combined.match(/^(\d+)\s*(?:tab|cap|pill)?/i) || combined.match(/(\d+)\s*(?:tab|cap|pill)/i);
    const qty = qtyMatch ? qtyMatch[1] : '1';
    lines.push(`Morning - ${qty}`);
    return { lines, foodTiming };
  }

  // Nocte / bedtime
  if (/\b(nocte|bedtime)\b/i.test(combined)) {
    const qtyMatch = combined.match(/^(\d+)\s*(?:tab|cap|pill)?/i) || combined.match(/(\d+)\s*(?:tab|cap|pill)/i);
    const qty = qtyMatch ? qtyMatch[1] : '1';
    lines.push(`Night - ${qty}`);
    return { lines, foodTiming };
  }

  // Fallback: Clean string
  lines.push(dosage || 'As prescribed');
  return { lines, foodTiming };
};

// ── Duration Extractor ──
const parseDuration = (instructions?: string | null): string => {
  if (!instructions) return 'As directed';
  const match = instructions.match(/(\d+\s*(days|day|weeks|week|months|month))/i);
  if (match) {
    const parts = match[0].split(/\s+/);
    if (parts.length === 2) {
      return `${parts[0]} ${parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase()}`;
    }
    return match[0];
  }
  return 'As directed';
};

const getPrescriptionMedications = (item: PrescriptionApiItem): PrescriptionMedication[] => {
  if (Array.isArray(item.prescription?.items)) return item.prescription.items;
  if (Array.isArray(item.medications)) return item.medications;
  if (Array.isArray(item.items)) return item.items;
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
      const rawMeds = getPrescriptionMedications(item);

      const medications: NormalizedMedication[] = rawMeds.map((medication, medicationIndex) => {
        const parsed = parseScheduleAndFoodTiming(medication.dosage, medication.instructions);
        return {
          name: cleanMedicationName(medication, medicationIndex),
          dosage: medication.dosage?.trim() || '',
          scheduleLines: parsed.lines,
          foodTiming: parsed.foodTiming,
          duration: parseDuration(medication.instructions || medication.frequency),
          quantity: medication.quantity,
          instructions: medication.instructions?.trim() || 'Take as directed.',
        };
      });

      return {
        id: String(item.prescription?.id || item.id || `prescription-${index}`),
        patientId: item.patient_id,
        dateLabel: formatVisitDate(visitDate),
        doctorName:
          item.doctor_name ||
          item.doctor?.staff?.user?.name ||
          item.doctor?.name ||
          'Assigned Doctor',
        doctorSpecialty: item.doctor?.specialization || 'Medical Officer',
        diagnosis: item.diagnosis?.trim() || 'General Consultation',
        symptoms: item.symptoms?.trim() || null,
        treatmentPlan: item.treatment_plan?.trim() || null,
        prescriptionNotes: item.prescription_notes?.trim() || null,
        followUpDate: item.follow_up_date || null,
        isActive: isPrescriptionActive(visitDate),
        medications,
      };
    });
};

export default function PrescriptionsScreen() {
  const router = useRouter();

  const [prescriptions, setPrescriptions] = useState<PrescriptionCardData[]>([]);
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({ name: 'Student Patient', studentId: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tab State: 'ACTIVE' vs 'COMPLETED'
  const [selectedTab, setSelectedTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');

  // User-Controlled Persistent Overrides & Reminders
  const [statusOverrides, setStatusOverrides] = useState<Record<string, 'ACTIVE' | 'COMPLETED'>>({});
  const [activeReminders, setActiveReminders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initPersistedData = async () => {
      try {
        const savedOverrides = await AsyncStorage.getItem('prescriptionStatusOverrides');
        if (savedOverrides) {
          setStatusOverrides(JSON.parse(savedOverrides));
        }
        const savedReminders = await AsyncStorage.getItem('prescriptionReminders');
        if (savedReminders) {
          setActiveReminders(JSON.parse(savedReminders));
        }
      } catch (e) {
        console.warn('Error reading persisted prescription settings:', e);
      }
    };

    initPersistedData();
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

      const token = (await AsyncStorage.getItem('userToken')) || (await SecureStore.getItemAsync('userToken'));
      const userId = (await AsyncStorage.getItem('userId')) || (await SecureStore.getItemAsync('userId'));

      if (!token) {
        throw new Error('You are not logged in. Please sign in again.');
      }
      if (!userId) {
        throw new Error('Unable to identify the current patient account.');
      }

      // 1. Fetch Patient Profile (for real Student ID & Name)
      try {
        const profileRes = await fetch(`${apiUrl}/api/profiles/${userId}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (profileRes.ok) {
          const profileJson = await profileRes.json();
          const patientData = profileJson?.data?.patient;
          if (patientData) {
            setPatientInfo({
              name: patientData.student?.full_name || patientData.student?.name || patientData.name || 'Student Patient',
              studentId: patientData.student?.university_reg_number || userId.slice(0, 8).toUpperCase(),
            });
          }
        }
      } catch {
        // Non-blocking: continue displaying prescriptions
      }

      // 2. Fetch Medical Records History
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

  // ── Handle Status Toggle ("Active" <-> "Completed") with Persistence ──
  const handleTogglePrescriptionStatus = async (id: string, currentlyActive: boolean) => {
    const nextStatus: 'ACTIVE' | 'COMPLETED' = currentlyActive ? 'COMPLETED' : 'ACTIVE';
    const updatedOverrides: Record<string, 'ACTIVE' | 'COMPLETED'> = {
      ...statusOverrides,
      [id]: nextStatus,
    };
    setStatusOverrides(updatedOverrides);

    try {
      await AsyncStorage.setItem('prescriptionStatusOverrides', JSON.stringify(updatedOverrides));
    } catch (e) {
      console.warn('Failed to save prescription status override:', e);
    }

    // If toggled to COMPLETED, automatically turn off dosage reminder for that prescription
    if (nextStatus === 'COMPLETED' && activeReminders[id]) {
      const updatedReminders = { ...activeReminders, [id]: false };
      setActiveReminders(updatedReminders);
      try {
        await AsyncStorage.setItem('prescriptionReminders', JSON.stringify(updatedReminders));
      } catch (e) {
        console.warn('Failed to update prescription reminders:', e);
      }
    }
  };

  // ── Handle Reminder Button with Persistence ──
  const handleToggleReminder = async (id: string, doctorName: string) => {
    const updated = !activeReminders[id];
    const newReminders = { ...activeReminders, [id]: updated };
    setActiveReminders(newReminders);

    try {
      await AsyncStorage.setItem('prescriptionReminders', JSON.stringify(newReminders));
    } catch (e) {
      console.warn('Failed to save prescription reminders:', e);
    }

    Alert.alert(
      updated ? 'Reminder Set' : 'Reminder Turned Off',
      updated
        ? `Daily notifications scheduled for medications prescribed by Dr. ${doctorName}.`
        : `Daily reminders have been disabled for this prescription.`
    );
  };

  // ── Filter Prescriptions based on User Overrides / Computed Status ──
  const activePrescriptions = prescriptions.filter((item) => {
    return statusOverrides[item.id] !== undefined
      ? statusOverrides[item.id] === 'ACTIVE'
      : item.isActive;
  });

  const completedPrescriptions = prescriptions.filter((item) => {
    return statusOverrides[item.id] !== undefined
      ? statusOverrides[item.id] === 'COMPLETED'
      : !item.isActive;
  });

  const displayedPrescriptions =
    selectedTab === 'ACTIVE' ? activePrescriptions : completedPrescriptions;

  const renderPrescriptionCard = ({ item }: { item: PrescriptionCardData }) => {
    const isCardActive =
      statusOverrides[item.id] !== undefined
        ? statusOverrides[item.id] === 'ACTIVE'
        : item.isActive;

    const isReminderActive = !!activeReminders[item.id];
    const displayId = patientInfo.studentId || (item.patientId ? item.patientId.slice(0, 8).toUpperCase() : 'PATIENT');

    return (
      <View style={styles.prescriptionCardContainer}>
        {/* ── 1. DOCTOR'S INFO SECTION ── */}
        <Text style={styles.sectionLabel}>Doctor's Info</Text>
        <View style={styles.doctorCard}>
          <View style={styles.doctorTopRow}>
            <View style={styles.doctorTextWrap}>
              <Text style={styles.doctorNameText}>Dr. {item.doctorName}</Text>
              <Text style={styles.visitDateText}>{item.dateLabel}</Text>
            </View>

            {/* Interactive User-Controlled Active/Completed Toggle Button */}
            <TouchableOpacity
              style={[
                styles.statusToggleButton,
                isCardActive ? styles.statusToggleActive : styles.statusToggleCompleted,
              ]}
              onPress={() => handleTogglePrescriptionStatus(item.id, isCardActive)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.statusToggleText}>
                {isCardActive ? 'Active ▾' : 'Completed ✓'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.metaRow}>
            <Text style={styles.metaRowText}>
              ID: {displayId} | {patientInfo.name} | Diagnosis: {item.diagnosis}
            </Text>
            {item.symptoms ? (
              <Text style={styles.metaSymptomsText}>Symptoms: {item.symptoms}</Text>
            ) : null}
          </View>
        </View>

        {/* ── 2. PRESCRIBED MEDICINES TABLE ── */}
        <Text style={styles.sectionLabel}>Prescribed Medicines</Text>
        <View style={styles.tableContainer}>
          {/* Table Header Row */}
          <View style={styles.tableHeaderRow}>
            <View style={styles.col1Header}>
              <Text style={styles.tableHeaderText}>Medicine Name</Text>
            </View>
            <View style={styles.col2Header}>
              <Text style={styles.tableHeaderText}>Schedule</Text>
              <Text style={styles.tableHeaderSubText}>(Dose & Time)</Text>
            </View>
            <View style={styles.col3Header}>
              <Text style={styles.tableHeaderText}>Duration</Text>
            </View>
          </View>

          {/* Table Body Rows */}
          {item.medications.map((med, mIdx) => {
            const isOdd = mIdx % 2 === 0;
            return (
              <View
                key={`med-${item.id}-${mIdx}`}
                style={[
                  styles.tableBodyRow,
                  { backgroundColor: isOdd ? '#DCECE2' : '#F2F8F4' },
                  mIdx === item.medications.length - 1 && styles.tableLastRow,
                ]}
              >
                {/* Column 1: Medicine Name */}
                <View style={styles.col1Cell}>
                  <Text style={styles.medNameText}>{med.name}</Text>
                </View>

                {/* Column 2: Schedule (Stacked lines + Food timing pill badge) */}
                <View style={styles.col2Cell}>
                  {med.scheduleLines.map((line, lIdx) => (
                    <Text key={`line-${lIdx}`} style={styles.scheduleLineText}>
                      {line}
                    </Text>
                  ))}
                  {med.foodTiming ? (
                    <View style={styles.foodTimingPill}>
                      <Text style={styles.foodTimingPillText}>{med.foodTiming}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Column 3: Duration & Quantity */}
                <View style={styles.col3Cell}>
                  <Text style={styles.durationValueText}>{med.duration}</Text>
                  {med.quantity ? (
                    <Text style={styles.totalQtyText}>(Tot: {med.quantity} Tab)</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* ── 3. DOCTOR'S ADVICE BANNER ── */}
        <View style={styles.adviceBanner}>
          <View style={styles.adviceHeaderRow}>
            <Text style={styles.adviceTitle}>Doctor's Advice</Text>
            <Ionicons name="alert-circle" size={20} color="#16211C" />
          </View>
          <Text style={styles.adviceBodyText}>
            {item.treatmentPlan
              ? `* ${item.treatmentPlan}`
              : item.prescriptionNotes
              ? `* ${item.prescriptionNotes}`
              : `* Take all prescribed medications as scheduled. Ensure complete rest and drink adequate fluids.`}
          </Text>
          {item.followUpDate ? (
            <View style={styles.followUpWrap}>
              <Text style={styles.followUpLabel}>
                Follow-Up Date: <Text style={styles.followUpValue}>{formatVisitDate(item.followUpDate)}</Text>
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── 4. PRIMARY ACTION BUTTON (STRICTLY FOR ACTIVE PRESCRIPTIONS ONLY) ── */}
        {isCardActive && (
          <TouchableOpacity
            style={[
              styles.reminderButton,
              isReminderActive && styles.reminderButtonActive,
            ]}
            onPress={() => handleToggleReminder(item.id, item.doctorName)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isReminderActive ? 'notifications' : 'notifications-outline'}
              size={20}
              color="#FFFFFF"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.reminderButtonText}>
              {isReminderActive ? 'REMINDER SET' : 'SET DAILY DOSAGE REMINDER'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEmptyState = () => {
    if (errorMessage) return null;

    const isActiveTab = selectedTab === 'ACTIVE';

    if (prescriptions.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <MaterialCommunityIcons name="file-document-edit-outline" size={48} color="#3B6E5C" />
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
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialCommunityIcons
            name={isActiveTab ? 'pill' : 'check-circle-outline'}
            size={48}
            color="#3B6E5C"
          />
        </View>
        <Text style={styles.emptyTitle}>
          {isActiveTab ? 'No Active Prescriptions' : 'No Completed Prescriptions'}
        </Text>
        <Text style={styles.emptyDescription}>
          {isActiveTab
            ? 'You have no ongoing active prescriptions. Tap the Completed tab to review past treatments.'
            : 'Any prescriptions you mark as finished will appear in this completed history.'}
        </Text>
        <TouchableOpacity
          style={styles.emptyRefreshButton}
          onPress={() => setSelectedTab(isActiveTab ? 'COMPLETED' : 'ACTIVE')}
          activeOpacity={0.8}
        >
          <Text style={styles.emptyRefreshText}>
            {isActiveTab ? 'View Completed Prescriptions' : 'View Active Prescriptions'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF3ED" />

      {/* ── TOP NAVIGATION HEADER ── */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)' as any);
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#16211C" />
        </TouchableOpacity>

        <Text style={styles.navTitle}>Prescription Details</Text>

        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => {
            Alert.alert(
              'Prescription Options',
              'Choose an option:',
              [
                { text: 'Refresh Records', onPress: loadPrescriptions },
                { text: 'Cancel', style: 'cancel' }
              ]
            );
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="dots-vertical" size={24} color="#16211C" />
        </TouchableOpacity>
      </View>

      {/* ── 2-TAB SEGMENTED FILTER BAR ("Active" vs "Completed") ── */}
      <View style={styles.tabBarContainer}>
        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'ACTIVE' && styles.tabButtonSelected]}
          onPress={() => setSelectedTab('ACTIVE')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabButtonText, selectedTab === 'ACTIVE' && styles.tabButtonTextSelected]}>
            Active ({activePrescriptions.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'COMPLETED' && styles.tabButtonSelected]}
          onPress={() => setSelectedTab('COMPLETED')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabButtonText, selectedTab === 'COMPLETED' && styles.tabButtonTextSelected]}>
            Completed ({completedPrescriptions.length})
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#3B6E5C" />
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
            data={displayedPrescriptions}
            keyExtractor={(item) => item.id}
            renderItem={renderPrescriptionCard}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={loadPrescriptions} tintColor="#3B6E5C" />
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
    backgroundColor: '#EAF3ED',
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#EAF3ED',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#16211C',
    letterSpacing: -0.2,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── 2-Tab Segmented Filter Bar ──
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#D5E6DC',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#C2D9CB',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  tabButtonSelected: {
    backgroundColor: '#3B6E5C',
    shadowColor: '#16211C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButtonText: {
    color: '#3B6E5C',
    fontSize: 14,
    fontWeight: '700',
  },
  tabButtonTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  body: {
    flex: 1,
    backgroundColor: '#EAF3ED',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 36,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    color: '#365345',
    fontSize: 14,
    fontWeight: '600',
  },
  prescriptionCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#D4E5DB',
    shadowColor: '#16211C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16211C',
    marginBottom: 10,
  },

  // ── Doctor's Info Card ──
  doctorCard: {
    backgroundColor: '#D5E6DC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#C2D9CB',
    shadowColor: '#16211C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  doctorTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  doctorTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  doctorNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#16211C',
    marginBottom: 4,
  },
  visitDateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#365345',
  },

  // ── Status Toggle Button ("Active ▾" vs "Completed ✓") ──
  statusToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  statusToggleActive: {
    backgroundColor: '#4E7A65',
  },
  statusToggleCompleted: {
    backgroundColor: '#7A8C82',
  },
  statusToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(22, 33, 28, 0.12)',
    marginVertical: 12,
  },
  metaRow: {
    gap: 4,
  },
  metaRowText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2C4A3E',
    lineHeight: 18,
  },
  metaSymptomsText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4B6357',
    lineHeight: 16,
  },

  // ── Prescribed Medicines Table ──
  tableContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#B8D0C1',
    backgroundColor: '#FFFFFF',
    marginBottom: 2,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#4E7A65',
  },
  col1Header: {
    flex: 1.3,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  col2Header: {
    flex: 1.3,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  col3Header: {
    flex: 0.9,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableHeaderText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tableHeaderSubText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.9,
    marginTop: 1,
  },
  tableBodyRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#B8D0C1',
    minHeight: 80,
  },
  tableLastRow: {
    borderBottomWidth: 0,
  },
  col1Cell: {
    flex: 1.3,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  col2Cell: {
    flex: 1.3,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#B8D0C1',
  },
  col3Cell: {
    flex: 0.9,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#16211C',
    lineHeight: 18,
  },
  scheduleLineText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16211C',
    marginVertical: 2,
    lineHeight: 18,
    textAlign: 'center',
  },
  foodTimingPill: {
    backgroundColor: '#E8833A',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
    alignSelf: 'center',
  },
  foodTimingPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  durationValueText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#16211C',
    textAlign: 'center',
  },
  totalQtyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 4,
    textAlign: 'center',
  },

  // ── Doctor's Advice Banner ──
  adviceBanner: {
    backgroundColor: '#F2B84B',
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
    shadowColor: '#16211C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  adviceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  adviceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16211C',
  },
  adviceBodyText: {
    fontSize: 13,
    color: '#16211C',
    lineHeight: 19,
    fontWeight: '600',
  },
  followUpWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(22, 33, 28, 0.15)',
  },
  followUpLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16211C',
  },
  followUpValue: {
    fontWeight: '800',
  },

  // ── Reminder Button (Active only) ──
  reminderButton: {
    backgroundColor: '#3B6E5C',
    borderRadius: 10,
    height: 50,
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B6E5C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  reminderButtonActive: {
    backgroundColor: '#2D5547',
  },
  reminderButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── Empty & Error States ──
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4E5DB',
    marginTop: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D5E6DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    color: '#16211C',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    color: '#365345',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B6E5C',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  emptyRefreshText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  errorContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginTop: 20,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
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
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  errorDescription: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorRetryButton: {
    backgroundColor: '#3B6E5C',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  errorRetryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});