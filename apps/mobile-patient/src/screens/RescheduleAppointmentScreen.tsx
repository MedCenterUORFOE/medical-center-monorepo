import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  ActivityIndicator, Alert, StatusBar 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
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

  // 🗓️ ඊළඟ දවස් 7 ස්වයංක්‍රීයව හදනවා
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

  // 1. මුලින්ම Appointment එකට අදාළ Doctor ID එක Backend එකෙන් ගන්නවා
  useEffect(() => {
    fetchAppointmentDetails();
  }, [id]);

  // 2. දවස වෙනස් කරද්දී ඒ දවසේ ඩොක්ටර්ගේ Slots ටික Backend එකෙන් ගන්නවා
  useEffect(() => {
    if (selectedDate && doctorId) {
      fetchDoctorSlots(selectedDate);
    }
  }, [selectedDate, doctorId]);

  const fetchAppointmentDetails = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = await AsyncStorage.getItem('userToken');

      // ඔයාගේ ප්‍රධාන appointments API එකෙන් සියලුම ලිස්ට් එක ගන්නවා
      const res = await fetch(`${API_URL}/api/appointments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const result = await res.json();
        const aptList = result.data || result.appointments || result || [];
        
        // දැනට තියෙන Appointment ID එකට ගැලපෙන එක හොයාගන්නවා
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
    setSelectedTime(''); // දවස මාරු කරද්දී කලින් තෝරපු වෙලාව මකනවා
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = await AsyncStorage.getItem('userToken');

      // ඩොක්ටර්ගේ ඇත්තම Availability Slots ගන්න API එක (අපි මුලින්ම හැදුවේ I කැපිටල් doctor_Id එකෙන්)
      const res = await fetch(`${API_URL}/api/doctors/${doctorId}/slots?date=${date}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const slotData = await res.json();
        // Backend එකෙන් එන slots Array එක ගන්නවා
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

  // 🚀 Confirm කරද්දී Patch කරන Function එක
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
          scheduled_time: selectedTime, // Slots එන්නේ දැනටමත් ISO string විදිහට නිසා කෙලින්ම යවනවා
          reason: "Rescheduled by patient via App" 
        })
      });
      
      if (res.ok) {
        Alert.alert('Success', 'Your appointment has been rescheduled successfully!');
        router.replace('/dashboard' as any); 
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

  // ISO String එකෙන් වෙලාව විතරක් ("10:30 AM") වගේ ලස්සනට කපලා ගන්නා Helper එක
  const formatSlotTime = (isoString: string) => {
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? isoString : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (isInitialLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#1B5E55" />
        <Text style={{ marginTop: 10, color: '#6B7280' }}>Fetching details...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reschedule Appointment</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
        <View style={styles.infoBox}>
          <FontAwesome5 name="user-md" size={24} color="#0284C7" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#0369A1' }}>Dr. {doctorName}</Text>
            <Text style={{ fontSize: 12, color: '#0369A1', marginTop: 2 }}>
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
            <ActivityIndicator size="small" color="#1B5E55" />
            <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280' }}>Loading doctor availability...</Text>
          </View>
        ) : !selectedDate ? (
          <View style={styles.emptySlotsBox}>
            <Text style={styles.emptySlotsText}>Please select a date first to view available times.</Text>
          </View>
        ) : availableSlots.length === 0 ? (
          <View style={styles.emptySlotsBox}>
            <MaterialCommunityIcons name="calendar-remove" size={28} color="#9CA3AF" />
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
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm Reschedule</Text>
          )}
        </TouchableOpacity>
      </View>
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#F9FAFB' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  container: { padding: 20, paddingBottom: 40 },
  infoBox: { flexDirection: 'row', backgroundColor: '#E0F2FE', padding: 16, borderRadius: 16, alignItems: 'center', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#111', marginBottom: 12, marginTop: 10 },
  
  dateScroll: { flexDirection: 'row', marginBottom: 24 },
  dateCard: { width: 65, height: 85, backgroundColor: '#FFF', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#E5E7EB', elevation: 2 },
  dateCardActive: { backgroundColor: '#1B5E55', borderColor: '#1B5E55' },
  dayName: { fontSize: 13, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase', fontWeight: '600' },
  dayNumber: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  timeChip: { width: '48%', backgroundColor: '#FFF', paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB', elevation: 1 },
  timeChipActive: { backgroundColor: '#1B5E55', borderColor: '#1B5E55' },
  timeText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  textActive: { color: '#FFF' },

  emptySlotsBox: { padding: 30, backgroundColor: '#FFF', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  emptySlotsText: { fontSize: 13, color: '#6B7280', textAlign: 'center', fontStyle: 'italic' },

  footer: { padding: 20, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingBottom: 30 },
  confirmButton: { backgroundColor: '#1B5E55', paddingVertical: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 3 },
  confirmButtonDisabled: { backgroundColor: '#9CA3AF', elevation: 0 },
  confirmButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});