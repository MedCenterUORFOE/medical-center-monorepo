import React, { useState, useEffect } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Doctor {
  id: string;
  name: string;
  specialization: string;
}

export default function BookAppointmentScreen() {
  const router = useRouter();
  
  // --- States ---
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  
  const [appointmentDate, setAppointmentDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [hasSelectedDate, setHasSelectedDate] = useState<boolean>(false);
  
  // New States for Dynamic Time Slots
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

  const fetchDoctors = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/api/doctors`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      if (response.ok) {
        const data = await response.json();
        const doctors = data.doctors || data.data || []; 
        
        if (Array.isArray(doctors) && doctors.length > 0) {
            setDoctorsList(doctors);
        } else {
            Alert.alert("Notice", "Currently, there are no doctors available.");
        }
      }
    } catch (error) {
      Alert.alert("Network Error", "Could not connect to the server.");
    } finally {
      setIsFetchingDoctors(false);
    }
  };

  
  // ✅ අලුත් Function එක: තෝරපු දවසට අදාළව ඩොක්ටර්ගේ වෙලාවල් ගෙනීම
  const fetchAvailableTimeSlots = async (doctorId: string, date: Date) => {
    setIsLoadingSlots(true);
    setAvailableSlots([]);
    setSelectedTimeSlot('');

    try {
      const token = await AsyncStorage.getItem('userToken');
      const dateString = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      // Backend එකේ Availability Route එකට කතා කිරීම
      const response = await fetch(`${API_URL}/api/doctors/${doctorId}/slots?date=${dateString}`, {
        method: 'GET',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.slots && data.data.slots.length > 0) {
          setAvailableSlots(data.data.slots);
        } else {
          setAvailableSlots([]);
        }
      } else {
        setAvailableSlots([]);
      }
    } catch (error) {
      console.error("Error fetching slots:", error);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  
 

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setAppointmentDate(selectedDate);
      setHasSelectedDate(true);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedDoctorId || !hasSelectedDate || !selectedTimeSlot) {
      Alert.alert("Validation Error", "Please select a doctor, date, and an available time slot.");
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
        scheduled_time: selectedTimeSlot, // ✅ App එකෙන් තෝරපු Slot එක (ISO String)
        reason: reason.trim()
      };

      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      // ✅ JSON Parse Error එක හැදීම (Crash වෙන්නේ නැති වෙන්න)
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
          { text: "OK", onPress: () => router.push('/dashboard' as any) }
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

  // Helper to format ISO slot to readable time (e.g., "08:30 AM")
  const formatTimeSlot = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        
        <View style={styles.headerSection}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book Appointment</Text>
        </View>

        <View style={styles.bottomCard}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.innerWhiteBox}>
              
              {/* Select Doctor */}
              <Text style={styles.inputLabel}>Select Doctor *</Text>
              {isFetchingDoctors ? (
                <ActivityIndicator color="#1D666A" style={{ alignSelf: 'flex-start' }} />
              ) : (
                <View style={styles.doctorListContainer}>
                  {doctorsList.map((doc) => (
                    <TouchableOpacity 
                      key={doc.id} 
                      style={[styles.doctorCard, selectedDoctorId === doc.id && styles.selectedDoctorCard]}
                      onPress={() => setSelectedDoctorId(doc.id)}
                    >
                      <Ionicons name="person" size={20} color={selectedDoctorId === doc.id ? "#FFFFFF" : "#1D666A"} />
                      <Text style={[styles.doctorName, selectedDoctorId === doc.id && { color: '#FFF' }]}> {doc.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Select Date */}
              <Text style={styles.inputLabel}>Select Date *</Text>
              <TouchableOpacity style={styles.pickerSelector} onPress={() => setShowDatePicker(true)}>
                <Text style={hasSelectedDate ? styles.selectedText : styles.placeholderText}>
                  {hasSelectedDate ? appointmentDate.toISOString().split('T')[0] : 'Choose a Date'}
                </Text>
                <Ionicons name="calendar-outline" size={22} color="#1D666A" />
              </TouchableOpacity>
              
              {showDatePicker && (
                <DateTimePicker
                  value={appointmentDate}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={onChangeDate}
                />
              )}

              {/* ✅ Dynamic Time Slots (ඔරලෝසුව වෙනුවට බටන්ස්) */}
              <Text style={styles.inputLabel}>Available Time Slots *</Text>
              {!selectedDoctorId || !hasSelectedDate ? (
                <Text style={{ color: '#888', fontSize: 13, fontStyle: 'italic' }}>Please select a doctor and date first.</Text>
              ) : isLoadingSlots ? (
                <ActivityIndicator color="#1D666A" style={{ alignSelf: 'flex-start' }} />
              ) : availableSlots.length === 0 ? (
                <Text style={{ color: 'red', fontSize: 13 }}>No available slots for this date.</Text>
              ) : (
                <View style={styles.slotsContainer}>
                  {availableSlots.map((slot, index) => (
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
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <View style={{ height: 20 }} />

              <TouchableOpacity style={styles.primaryButton} onPress={handleBookAppointment} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Confirm Appointment</Text>}
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
  container: { flex: 1, backgroundColor: '#1D666A' },
  headerSection: { paddingHorizontal: 30, paddingTop: 10, paddingBottom: 20 },
  backButton: { marginBottom: 15, width: 40 },
  headerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold' },
  bottomCard: { flex: 1, backgroundColor: '#E8ECEC', borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  scrollContent: { padding: 30 },
  innerWhiteBox: { backgroundColor: '#FFFFFF', borderRadius: 30, padding: 20 },
  inputLabel: { fontSize: 14, color: '#000000', fontWeight: '600', marginBottom: 8, marginTop: 15 },
  inputBox: { backgroundColor: '#E0E0E0', borderRadius: 12, paddingHorizontal: 15, height: 50, fontSize: 15, color: '#000000' },
  textArea: { height: 80, paddingTop: 15 },
  pickerSelector: { height: 50, backgroundColor: '#E0E0E0', borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15 },
  placeholderText: { color: '#757575', fontSize: 15 },
  selectedText: { color: '#000000', fontSize: 15, fontWeight: '500' },
  doctorListContainer: { marginTop: 5 },
  doctorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  selectedDoctorCard: { backgroundColor: '#1D666A', borderColor: '#1D666A' },
  doctorName: { fontSize: 15, fontWeight: 'bold', marginLeft: 10 },
  
  // New Styles for Time Slots
  slotsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 },
  slotButton: { backgroundColor: '#E0E0E0', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, borderWidth: 1, borderColor: '#CCC' },
  selectedSlotButton: { backgroundColor: '#1D666A', borderColor: '#1D666A' },
  slotText: { color: '#333', fontSize: 14, fontWeight: '600' },
  selectedSlotText: { color: '#FFF' },

  primaryButton: { height: 55, backgroundColor: '#1D666A', borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});