import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  ActivityIndicator, Alert, StatusBar 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '../theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RescheduleAppointmentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // Appointment ID
  
  const [doctorId, setDoctorId] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isSlotsLoading, setIsSlotsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 🗓️ Automatically generates the next 7 days
  const generateNextDays = () => {
    const dates = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push({
        fullDate: d.toISOString().split('T')[0], 
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }), 
        dayNumber: d.getDate().toString(), 
      });
    }
    return dates;
  };

  const availableDates = generateNextDays();

  // 1. First, get the Doctor ID related to the Appointment from the Backend
  useEffect(() => {
    fetchAppointmentDetails();
  }, [id]);

  // 2. When changing the date, fetch the doctor's Slots for that day from the Backend
  useEffect(() => {
    if (selectedDate && doctorId) {
      fetchDoctorSlots(selectedDate);
    }
  }, [selectedDate, doctorId]);

  const fetchAppointmentDetails = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = await AsyncStorage.getItem('userToken');

      // Fetch the full list from your main appointments API
      const res = await fetch(`${API_URL}/api/appointments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const result = await res.json();
        const aptList = result.data || result.appointments || result || [];
        
        // Find the one matching the current Appointment ID
        const currentApt = aptList.find((apt: any) => apt.id === id || apt.appointment_id === id);
        
        if (currentApt && currentApt.doctor_id) {
          setDoctorId(currentApt.doctor_id);
          setDoctorName(currentApt.doctor?.staff?.user?.name || 'Doctor');
        } else {
          Alert.alert('Error', 'Could not find doctor details for this appointment.');
        }
      }
    } catch (error) {
      console.error("Error fetching appointment details:", error);
    } finally {
      setIsInitialLoading(false);
    }
  };

  const fetchDoctorSlots = async (date: string) => {
    setIsSlotsLoading(true);
    setSelectedTime(''); // Clear previously selected time when changing date
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = await AsyncStorage.getItem('userToken');

      // API to fetch doctor's actual Availability Slots (we initially created with capital I doctor_Id)
      const res = await fetch(`${API_URL}/api/doctors/${doctorId}/slots?date=${date}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const slotData = await res.json();
        // Get the slots Array coming from the Backend
        const slots = slotData.data?.slots || slotData.slots || [];
        setAvailableSlots(slots);
      } else {
        setAvailableSlots([]);
      }
    } catch (error) {
      console.error("Error fetching doctor slots:", error);
      setAvailableSlots([]);
    } finally {
      setIsSlotsLoading(false);
    }
  };

  // 🚀 Function to Patch when Confirming
  const handleConfirmReschedule = async () => {
    if (!selectedDate || !selectedTime) {
      Alert.alert('Selection Required', 'Please select both a new date and a time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = await AsyncStorage.getItem('userToken');

      const res = await fetch(`${API_URL}/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          scheduled_time: selectedTime, // Slots already come as ISO strings, so send directly
          reason: "Rescheduled by patient via App" 
        })
      });
      
      if (res.ok) {
        Alert.alert('Success', 'Your appointment has been rescheduled successfully!');
        router.replace('/(tabs)' as any); 
      } else {
        const errorData = await res.json();
        Alert.alert('Error', errorData.message || 'Failed to reschedule.');
      }
    } catch (error) {
      Alert.alert('Error', 'Network connection failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to cleanly extract only the time (like "10:30 AM") from the ISO String
  const formatSlotTime = (isoString: string) => {
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? isoString : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (isInitialLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#1B5E55" />
        <Text style={{ marginTop: 10, color: colors.textSecondary }}>Fetching details...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reschedule Appointment</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
        <View style={styles.infoBox}>
          <FontAwesome5 name="user-md" size={24} color={colors.primary} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 15, color: colors.primaryText }}>Dr. {doctorName}</Text>
            <Text style={{ fontSize: 12, color: colors.primaryText, marginTop: 2 }}>
              Rescheduling will update your time slot with this doctor.
            </Text>
          </View>
        </View>

        {/* --- Date Selection --- */}
        <Text style={styles.sectionTitle}>Select New Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
          {availableDates.map((date) => {
            const isSelected = selectedDate === date.fullDate;
            return (
              <TouchableOpacity
                key={date.fullDate}
                style={[styles.dateCard, isSelected && styles.dateCardActive]}
                onPress={() => setSelectedDate(date.fullDate)}
              >
                <Text style={[styles.dayName, isSelected && styles.textActive]}>{date.dayName}</Text>
                <Text style={[styles.dayNumber, isSelected && styles.textActive]}>{date.dayNumber}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* --- Time Selection --- */}
        <Text style={styles.sectionTitle}>Available Time Slots</Text>
        
        {isSlotsLoading ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280' }}>Loading doctor availability...</Text>
          </View>
        ) : !selectedDate ? (
          <View style={styles.emptySlotsBox}>
            <Text style={styles.emptySlotsText}>Please select a date first to view available times.</Text>
          </View>
        ) : availableSlots.length === 0 ? (
          <View style={styles.emptySlotsBox}>
            <MaterialCommunityIcons name="calendar-remove" size={28} color={colors.textSecondary} />
            <Text style={[styles.emptySlotsText, { marginTop: 6 }]}>No slots available or Doctor is not working on this day.</Text>
          </View>
        ) : (
          <View style={styles.timeGrid}>
            {availableSlots.map((slot) => {
              const isSelected = selectedTime === slot;
              return (
                <TouchableOpacity
                  key={slot}
                  style={[styles.timeChip, isSelected && styles.timeChipActive]}
                  onPress={() => setSelectedTime(slot)}
                >
                  <Text style={[styles.timeText, isSelected && styles.textActive]}>
                    {formatSlotTime(slot)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.confirmButton, (!selectedDate || !selectedTime) && styles.confirmButtonDisabled]} 
          onPress={handleConfirmReschedule}
          disabled={!selectedDate || !selectedTime || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm Reschedule</Text>
          )}
        </TouchableOpacity>
      </View>
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.headerBanner },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: colors.headerBanner,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.65)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  container: { padding: 20, paddingBottom: 40, backgroundColor: colors.background },
  infoBox: { flexDirection: 'row', backgroundColor: colors.surface, padding: 16, borderRadius: 16, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12, marginTop: 10 },
  
  dateScroll: { flexDirection: 'row', marginBottom: 24 },
  dateCard: { width: 65, height: 85, backgroundColor: colors.surface, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: colors.border, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
  dateCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayName: { fontSize: 13, color: colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', fontWeight: '600' },
  dayNumber: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary },
  
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  timeChip: { width: '48%', backgroundColor: colors.surface, paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: colors.border, elevation: 1 },
  timeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  textActive: { color: colors.textOnPrimary },

  emptySlotsBox: { padding: 30, backgroundColor: colors.surface, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  emptySlotsText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', fontStyle: 'italic' },

  footer: { padding: 20, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: 30 },
  confirmButton: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 3, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6 },
  confirmButtonDisabled: { backgroundColor: colors.disabled, elevation: 0 },
  confirmButtonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: 'bold' }
});