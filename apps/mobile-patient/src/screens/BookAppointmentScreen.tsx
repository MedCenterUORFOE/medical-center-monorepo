import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

export interface Doctor {
  id: string;
  name: string;
  specialization?: string;
  email?: string;
  status?: string;
  is_active?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  user?: {
    name?: string;
    email?: string;
    status?: string;
    is_active?: boolean;
    is_deleted?: boolean;
    deleted_at?: string | null;
  };
}

// ============================================================================
// DOCTOR VALIDATION HELPERS (Filter Out Deleted / Deactivated Doctors)
// ============================================================================

/**
 * Determines whether a doctor record represents an active, valid doctor.
 * Filters out deleted, deactivated, suspended, or anonymized doctor accounts.
 */
export const isValidActiveDoctor = (doctor: any): boolean => {
  if (!doctor || typeof doctor !== 'object') return false;

  // 1. Validate ID
  const doctorId = doctor.id || doctor.doctor_id || doctor.staff_id;
  if (!doctorId || typeof doctorId !== 'string' || !doctorId.trim()) {
    return false;
  }

  // 2. Validate Name
  const rawName = (doctor.name || doctor.user?.name || doctor.staff?.user?.name || '').trim();
  if (!rawName) {
    return false;
  }

  // Strip common prefixes like "Dr.", "Dr ", "Doctor " for normalized comparison
  const normalizedName = rawName.toLowerCase().replace(/^(dr\.?|doctor)\s+/i, '').trim();

  const invalidNames = ['deleted user', 'deleted doctor', 'deleted', 'unknown', 'inactive', 'suspended'];
  if (invalidNames.includes(normalizedName) || normalizedName.startsWith('deleted')) {
    return false;
  }

  // Check if raw name contains isolated "deleted" word
  if (/\bdeleted\b/i.test(rawName)) {
    return false;
  }

  // 3. Validate Email (if present)
  const email = (doctor.email || doctor.user?.email || doctor.staff?.user?.email || '').trim().toLowerCase();
  if (email && (email.startsWith('deleted') || email.includes('@anonymized.local') || email.includes('deleted_'))) {
    return false;
  }

  // 4. Validate Status Flags on doctor record
  if (doctor.is_deleted === true || doctor.deleted_at != null) {
    return false;
  }
  if (doctor.is_active === false) {
    return false;
  }
  if (doctor.status && ['DELETED', 'INACTIVE', 'SUSPENDED'].includes(String(doctor.status).toUpperCase())) {
    return false;
  }

  // 5. Validate Status Flags on nested user object (if present)
  const userObj = doctor.user || doctor.staff?.user;
  if (userObj) {
    if (userObj.is_deleted === true || userObj.deleted_at != null) {
      return false;
    }
    if (userObj.is_active === false) {
      return false;
    }
    if (userObj.status && ['DELETED', 'INACTIVE', 'SUSPENDED'].includes(String(userObj.status).toUpperCase())) {
      return false;
    }
  }

  return true;
};

// Shifts in Sri Lanka local time (day of week: 0=Sunday, 1=Monday, ..., 6=Saturday)
interface ShiftSchedule {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

// Fallback Doctor Working Schedules (matching Prisma DoctorAvailability templates)
const DOCTOR_SCHEDULES: Record<string, Record<number, ShiftSchedule>> = {
  // Dr. Kamal Gunasekara (Cardiology)
  '8dd688ea-a01e-4be3-9bf1-c160315d4c3e': {
    6: { startHour: 14, startMinute: 30, endHour: 22, endMinute: 30 }, // Saturday: 02:30 PM - 10:30 PM (SLST)
    0: { startHour: 14, startMinute: 30, endHour: 22, endMinute: 30 }, // Sunday: 02:30 PM - 10:30 PM
    2: { startHour: 14, startMinute: 30, endHour: 22, endMinute: 30 }, // Tuesday: 02:30 PM - 10:30 PM
    5: { startHour: 14, startMinute: 30, endHour: 23, endMinute: 59 }, // Friday: 02:30 PM - 11:59 PM
  },
  // Dr. Sandun Kumara (General)
  'e430c8b1-667f-4f7b-af30-02af093effc5': {
    1: { startHour: 14, startMinute: 30, endHour: 22, endMinute: 30 }, // Monday
    2: { startHour: 14, startMinute: 30, endHour: 16, endMinute: 30 }, // Tuesday
    4: { startHour: 14, startMinute: 30, endHour: 22, endMinute: 30 }, // Thursday
    5: { startHour: 14, startMinute: 30, endHour: 22, endMinute: 30 }, // Friday
  },
  // Dr. Kasun Bandara
  '6341f507-b90a-43be-883e-77b51beaf1b9': {
    1: { startHour: 13, startMinute: 30, endHour: 17, endMinute: 30 }, // Monday
    3: { startHour: 18, startMinute: 30, endHour: 22, endMinute: 30 }, // Wednesday
    5: { startHour: 13, startMinute: 30, endHour: 17, endMinute: 30 }, // Friday
  }
};

/**
 * Generates 15-minute ISO slots for a doctor's shift on a local calendar date.
 */
export const generateSlotsForShift = (
  date: Date,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): string[] => {
  const slots: string[] = [];
  const start = new Date(date);
  start.setHours(startHour, startMinute, 0, 0);

  const end = new Date(date);
  end.setHours(endHour, endMinute, 0, 0);

  let current = new Date(start);
  while (current < end) {
    slots.push(current.toISOString());
    current = new Date(current.getTime() + 15 * 60 * 1000);
  }
  return slots;
};

// ============================================================================
// DATE & TIME VALIDATION HELPERS (Device Local Time)
// ============================================================================

/**
 * Formats a Date to 'YYYY-MM-DD' using local calendar date (year, month, day).
 * Avoids UTC shifting issues from `toISOString().split('T')[0]` in timezones like +05:30.
 */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Checks whether a given Date is today in the device's local calendar.
 */
export const isToday = (date: Date): boolean => {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

/**
 * Checks whether a given Date is strictly before today in the device's local calendar.
 */
export const isPastDate = (date: Date): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return target.getTime() < today.getTime();
};

/**
 * Returns a Date object representing the start of today (00:00:00.000) for date pickers.
 */
export const getStartOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Determines whether a time slot is still in the future / active for the selected calendar date.
 * - If selectedDate is a past calendar date -> returns false.
 * - If selectedDate is a future calendar date (tomorrow or later) -> returns true.
 * - If selectedDate is TODAY:
 *   Hermes-safe numeric extraction of hours and minutes.
 *   Each consultation slot is 15 minutes long.
 *   Passed slots (whose 15-minute consultation window has completely ended) are filtered out.
 *   Active and future slots remain visible.
 */
export const isSlotInFuture = (slot: string, selectedDate: Date): boolean => {
  if (!slot) return true;

  // Past calendar dates cannot have valid future slots
  if (isPastDate(selectedDate)) {
    return false;
  }

  // Future calendar dates (tomorrow and beyond) show all available slots
  if (!isToday(selectedDate)) {
    return true;
  }

  try {
    const selectedDateStr = formatLocalDate(selectedDate);
    const [year, month, day] = selectedDateStr.split('-').map(Number);
    let startStr = slot.trim();

    let hours: number | null = null;
    let minutes: number | null = null;

    // 1. If it's an ISO string (contains 'T', e.g. "2026-10-31T10:30:00.000Z")
    // NOTE: We MUST check this first and NOT split by '-' which would corrupt "2026-10-31" to "2026"
    if (startStr.includes('T')) {
      const parsedIso = new Date(startStr);
      if (!isNaN(parsedIso.getTime())) {
        hours = parsedIso.getHours();
        minutes = parsedIso.getMinutes();
      }
    } else {
      // If it's a range like "02:00 PM - 02:30 PM" or "14:00 - 14:30", take start time
      startStr = startStr.split(/\s+[-–]\s+/)[0].trim();
    }

    // 2. Handle 12-hour AM/PM format (e.g. "04:00 PM", "4:00 PM", "09:00 AM")
    if (hours === null) {
      const match12 = startStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
      if (match12) {
        let h = parseInt(match12[1], 10);
        const m = parseInt(match12[2], 10);
        const period = match12[3].toUpperCase();

        if (period === 'PM' && h < 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;

        hours = h;
        minutes = m;
      }
    }

    // 3. Handle 24-hour format (e.g. "16:00", "16:00:00", "09:00")
    if (hours === null) {
      const match24 = startStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (match24) {
        hours = parseInt(match24[1], 10);
        minutes = parseInt(match24[2], 10);
      }
    }

    // 4. Fallback if format is non-standard
    if (hours === null || minutes === null) {
      const fallback = new Date(startStr);
      if (!isNaN(fallback.getTime())) {
        hours = fallback.getHours();
        minutes = fallback.getMinutes();
      }
    }

    // If parsing completely failed, do NOT hide the slot (Hermes safe fallback)
    if (hours === null || minutes === null) {
      return true;
    }

    // Construct the Hermes-safe slot Date object
    const slotDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (isNaN(slotDate.getTime())) {
      return true; // Never hide if date calculation fails
    }

    // A 15-minute slot is active until its consultation window ends
    const slotEndTime = new Date(slotDate.getTime() + 15 * 60 * 1000);
    return slotEndTime.getTime() > Date.now();
  } catch (e) {
    // On any unexpected error, safely show the slot
    return true;
  }
};

export default function BookAppointmentScreen() {
  const router = useRouter();

  // --- States ---
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');

  const [appointmentDate, setAppointmentDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [hasSelectedDate, setHasSelectedDate] = useState<boolean>(false);

  // States for Dynamic Time Slots
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);

  const [reason, setReason] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetchingDoctors, setIsFetchingDoctors] = useState<boolean>(true);

  const API_URL = process.env.EXPO_PUBLIC_API_URL;

  // 1. Fetch Doctors on Load
  useEffect(() => {
    fetchDoctors();
  }, []);

  // 2. Fetch Time Slots when Doctor OR Date changes
  useEffect(() => {
    if (selectedDoctorId && hasSelectedDate) {
      fetchAvailableTimeSlots(selectedDoctorId, appointmentDate);
    }
  }, [selectedDoctorId, appointmentDate, hasSelectedDate]);

  // 3. Filter out passed time slots when appointmentDate is today
  const filteredSlots = useMemo(() => {
    return availableSlots.filter((slot) => isSlotInFuture(slot, appointmentDate));
  }, [availableSlots, appointmentDate]);

  // 4. Automatically clear selectedTimeSlot if it becomes invalid
  useEffect(() => {
    if (selectedTimeSlot && !filteredSlots.includes(selectedTimeSlot)) {
      setSelectedTimeSlot('');
    }
  }, [filteredSlots, selectedTimeSlot]);

  const fetchDoctors = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/api/doctors`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 
            'Authorization': `Bearer ${token}`,
            'Cookie': `session_token=${token}`
          } : {})
        }
      });

      if (response.ok) {
        const data = await response.json();
        const rawDoctors = data.doctors || data.data || [];

        if (Array.isArray(rawDoctors)) {
          // Strict Active-Doctor Filtering: Exclude any deleted, deactivated, or anonymized doctors
          const activeDoctors = rawDoctors.filter(isValidActiveDoctor);

          if (activeDoctors.length > 0) {
            setDoctorsList(activeDoctors);
            // Auto-selection safety: If current selection is invalid or not in activeDoctors, reset
            setSelectedDoctorId((prev) => {
              if (prev && activeDoctors.some((d: Doctor) => d.id === prev)) {
                return prev;
              }
              return '';
            });
          } else {
            setDoctorsList([]);
            setSelectedDoctorId('');
            Alert.alert("Notice", "Currently, there are no active doctors available.");
          }
        } else {
          setDoctorsList([]);
          setSelectedDoctorId('');
          Alert.alert("Notice", "Currently, there are no active doctors available.");
        }
      }
    } catch (error) {
      Alert.alert("Network Error", "Could not connect to the server.");
    } finally {
      setIsFetchingDoctors(false);
    }
  };

  // Fetch doctor's available times for the selected date
  const fetchAvailableTimeSlots = async (doctorId: string, date: Date) => {
    setIsLoadingSlots(true);
    setAvailableSlots([]);
    setSelectedTimeSlot('');

    try {
      const token = await AsyncStorage.getItem('userToken');
      // Format using local calendar date (YYYY-MM-DD)
      const dateString = formatLocalDate(date);

      // Calling the backend Availability Route with both Bearer token and Cookie for Next.js auth compatibility
      const response = await fetch(`${API_URL}/api/doctors/${doctorId}/slots?date=${dateString}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 
            'Authorization': `Bearer ${token}`,
            'Cookie': `session_token=${token}`
          } : {})
        }
      });

      if (response.ok) {
        const data = await response.json();
        const rawSlots = data.data?.slots || data.slots || [];
        if (Array.isArray(rawSlots) && rawSlots.length > 0) {
          setAvailableSlots(rawSlots);
          return;
        }
      }

      // Fallback: If backend returns empty or auth fails, generate slots from doctor's shift template
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      const doctorSchedule = DOCTOR_SCHEDULES[doctorId]?.[dayOfWeek];
      if (doctorSchedule) {
        const fallbackSlots = generateSlotsForShift(
          date,
          doctorSchedule.startHour,
          doctorSchedule.startMinute,
          doctorSchedule.endHour,
          doctorSchedule.endMinute
        );
        setAvailableSlots(fallbackSlots);
      } else {
        setAvailableSlots([]);
      }
    } catch (error) {
      console.error("Error fetching slots, trying fallback:", error);
      const dayOfWeek = date.getDay();
      const doctorSchedule = DOCTOR_SCHEDULES[doctorId]?.[dayOfWeek];
      if (doctorSchedule) {
        const fallbackSlots = generateSlotsForShift(
          date,
          doctorSchedule.startHour,
          doctorSchedule.startMinute,
          doctorSchedule.endHour,
          doctorSchedule.endMinute
        );
        setAvailableSlots(fallbackSlots);
      } else {
        setAvailableSlots([]);
      }
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      if (isPastDate(selectedDate)) {
        Alert.alert("Invalid Date", "You cannot select a past date. Please choose today or a future date.");
        return;
      }
      setAppointmentDate(selectedDate);
      setHasSelectedDate(true);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedDoctorId || !hasSelectedDate || !selectedTimeSlot) {
      Alert.alert("Validation Error", "Please select a doctor, date, and an available time slot.");
      return;
    }

    // Safety check: ensure selected doctor is still an active, non-deleted doctor
    const selectedDoctor = doctorsList.find((doc) => doc.id === selectedDoctorId);
    if (!selectedDoctor || !isValidActiveDoctor(selectedDoctor)) {
      Alert.alert("Invalid Doctor", "The selected doctor is no longer available. Please select another doctor.");
      setSelectedDoctorId('');
      return;
    }

    if (!isSlotInFuture(selectedTimeSlot, appointmentDate)) {
      Alert.alert("Time Slot Expired", "The selected time slot has already passed. Please select another time slot.");
      setSelectedTimeSlot('');
      return;
    }
    if (!reason || reason.trim().length < 3) {
      Alert.alert("Validation Error", "Please provide a reason for the appointment.");
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        doctor_id: selectedDoctorId,
        scheduled_time: selectedTimeSlot, // Slot selected from the App (ISO String)
        reason: reason.trim()
      };

      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 
            'Authorization': `Bearer ${token}`,
            'Cookie': `session_token=${token}`
          } : {})
        },
        body: JSON.stringify(payload)
      });

      // Handling JSON Parse Error (to prevent crashing)
      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error("❌ Non-JSON Response from Server:", responseText);
        Alert.alert("Server Error", "The server encountered an error. Please check backend terminal.");
        setIsLoading(false);
        return;
      }

      if (response.ok || response.status === 201) {
        Alert.alert("Success", "Appointment booked successfully!", [
          { text: "OK", onPress: () => router.push('/(tabs)' as any) }
        ]);
      } else {
        Alert.alert("Booking Failed", responseData.message || "Failed to book appointment.");
      }
    } catch (error) {
      Alert.alert("Network Error", "Could not connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to format slot string to readable time (e.g., "04:00 PM")
  const formatTimeSlot = (slotStr: string) => {
    if (!slotStr) return '';
    if (slotStr.includes('T')) {
      const date = new Date(slotStr);
      if (!isNaN(date.getTime())) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
    }
    return slotStr;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

        <View style={styles.headerSection}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book Appointment</Text>
        </View>

        <View style={styles.bottomCard}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.innerWhiteBox}>

              {/* Select Doctor */}
              <Text style={styles.inputLabel}>Select Doctor *</Text>
              {isFetchingDoctors ? (
                <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />
              ) : doctorsList.length === 0 ? (
                <Text style={styles.helperText}>No active doctors currently available.</Text>
              ) : (
                <View style={styles.doctorListContainer}>
                  {doctorsList.map((doc) => (
                    <TouchableOpacity
                      key={doc.id}
                      style={[styles.doctorCard, selectedDoctorId === doc.id && styles.selectedDoctorCard]}
                      onPress={() => setSelectedDoctorId(doc.id)}
                    >
                      <Ionicons name="person" size={20} color={selectedDoctorId === doc.id ? colors.textOnPrimary : colors.primaryText} />
                      <Text style={[styles.doctorName, selectedDoctorId === doc.id && { color: colors.textOnPrimary }]}> {doc.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Select Date */}
              <Text style={styles.inputLabel}>Select Date *</Text>
              <TouchableOpacity style={styles.pickerSelector} onPress={() => setShowDatePicker(true)}>
                <Text style={hasSelectedDate ? styles.selectedText : styles.placeholderText}>
                  {hasSelectedDate ? formatLocalDate(appointmentDate) : 'Choose a Date'}
                </Text>
                <Ionicons name="calendar-outline" size={22} color={colors.primaryText} />
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={appointmentDate}
                  mode="date"
                  display="default"
                  minimumDate={getStartOfToday()}
                  onChange={onChangeDate}
                />
              )}

              {/* Dynamic Time Slots */}
              <Text style={styles.inputLabel}>Available Time Slots *</Text>
              {!selectedDoctorId || !hasSelectedDate ? (
                <Text style={styles.helperText}>Please select a doctor and date first.</Text>
              ) : isLoadingSlots ? (
                <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />
              ) : filteredSlots.length === 0 ? (
                <View style={styles.emptySlotBox}>
                  <Ionicons name="time-outline" size={20} color="#DC2626" style={{ marginRight: 8 }} />
                  <Text style={styles.emptySlotText}>
                    {isToday(appointmentDate)
                      ? "No more available time slots remaining for today. Please select another date."
                      : "No available time slots for this date."}
                  </Text>
                </View>
              ) : (
                <View style={styles.slotsContainer}>
                  {filteredSlots.map((slot, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[styles.slotButton, selectedTimeSlot === slot && styles.selectedSlotButton]}
                      onPress={() => setSelectedTimeSlot(slot)}
                    >
                      <Text style={[styles.slotText, selectedTimeSlot === slot && styles.selectedSlotText]}>
                        {formatTimeSlot(slot)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Reason */}
              <Text style={styles.inputLabel}>Reason for Visit *</Text>
              <TextInput
                style={[styles.inputBox, styles.textArea]}
                value={reason}
                onChangeText={setReason}
                placeholder="Describe your symptoms"
                placeholderTextColor={colors.placeholder}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <View style={{ height: 20 }} />

              <TouchableOpacity style={styles.primaryButton} onPress={handleBookAppointment} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.primaryButtonText}>Confirm Appointment</Text>}
              </TouchableOpacity>

            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── STYLESHEET ──
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.softSurface },
  headerSection: { paddingHorizontal: 30, paddingTop: 10, paddingBottom: 20 },
  backButton: { marginBottom: 15, width: 40 },
  headerTitle: { color: colors.textPrimary, fontSize: 28, fontWeight: 'bold' },
  bottomCard: { flex: 1, backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  scrollContent: { padding: 24 },
  innerWhiteBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 },
  inputLabel: { fontSize: 14, color: colors.textPrimary, fontWeight: '600', marginBottom: 8, marginTop: 15 },
  inputBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 15, height: 50, fontSize: 15, color: colors.textPrimary },
  textArea: { height: 80, paddingTop: 15 },
  pickerSelector: { height: 50, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15 },
  placeholderText: { color: colors.placeholder, fontSize: 15 },
  selectedText: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  doctorListContainer: { marginTop: 5 },
  doctorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  selectedDoctorCard: { backgroundColor: colors.primary, borderColor: colors.primary },
  doctorName: { fontSize: 15, fontWeight: 'bold', marginLeft: 10, color: colors.textPrimary },

  helperText: { color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' },
  emptySlotBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  emptySlotText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    lineHeight: 18,
  },

  // Styles for Time Slots
  slotsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 },
  slotButton: { backgroundColor: colors.surface, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  selectedSlotButton: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  selectedSlotText: { color: colors.textOnPrimary },

  primaryButton: { height: 52, backgroundColor: colors.primary, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginTop: 15, elevation: 2, shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  primaryButtonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: 'bold' },
});