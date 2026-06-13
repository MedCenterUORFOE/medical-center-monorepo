import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

// Define rigid data type contracts matching the backend validation expectations
interface StudentDetails {
  university_reg_number: string;
  faculty: string;
  department: string;
  year_of_study: number;
  batch: string;
}

interface AcademicStaffDetails {
  university_staff_id: string;
  department: string;
  position: string;
  university_email: string;
  ExtraCertificateRecipient: string | null;
}

interface CompleteProfilePayload {
  role: 'STUDENT' | 'ACADEMIC_STAFF';
  nic: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_number: string;
  student_details?: StudentDetails;
  academic_staff_details?: AcademicStaffDetails;
}

export default function CompleteProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Enforce types safely from search parameters or fallback to student context
  const targetRole = (params.role as 'STUDENT' | 'ACADEMIC_STAFF') || 'STUDENT';
  const [role, setRole] = useState<'STUDENT' | 'ACADEMIC_STAFF'>(targetRole);
  const [nic, setNic] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // ── STUDENT Fields ──────────────────────────────
  const [batch, setBatch] = useState<string>('');
  const [studentDepartment, setStudentDepartment] = useState<string>('');
  const [studentFullName, setStudentFullName] = useState<string>('');       
  const [studentPhone, setStudentPhone] = useState<string>('');             
  const [faculty, setFaculty] = useState<string>('');
  const [studentEmail, setStudentEmail] = useState<string>('');             
  const [universityRegNumber, setUniversityRegNumber] = useState<string>(''); 
  const [yearOfStudy, setYearOfStudy] = useState<string>('');               

  // ── ACADEMIC STAFF Fields ───────────────────────
  const [universityStaffId, setUniversityStaffId] = useState<string>('');   
  const [staffDepartment, setStaffDepartment] = useState<string>('');
  const [staffFullName, setStaffFullName] = useState<string>('');           
  const [staffPhone, setStaffPhone] = useState<string>('');                 
  const [position, setPosition] = useState<string>('');
  const [staffEmail, setStaffEmail] = useState<string>('');                 
  const [extraCertificate, setExtraCertificate] = useState<string>('');     

  // Dropdowns Visibility Toggles
  const [showStudentDeptDropdown, setShowStudentDeptDropdown] = useState<boolean>(false);
  const [showStaffDeptDropdown, setShowStaffDeptDropdown] = useState<boolean>(false);
  const [showPosDropdown, setShowPosDropdown] = useState<boolean>(false);
  const [showYearDropdown, setShowYearDropdown] = useState<boolean>(false);

  const departments: string[] = ['DEIE', 'DCEE', 'DMME', 'DCE', 'DMANAE'];
  const positions: string[] = ['Senior Lecturer', 'Visiting Lecturer', 'Prof', 'Dr', 'Probationary Lecturer'];
  const studyYears: string[] = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  // ✅ Extracted dynamically from centralized mobile system environment configs
  const API_URL = process.env.EXPO_PUBLIC_API_URL;

  const yearStringToInt = (val: string): number => {
    const map: Record<string, number> = { '1st Year': 1, '2nd Year': 2, '3rd Year': 3, '4th Year': 4 };
    return map[val] ?? 1;
  };

  const formatPhoneNumber = (num: string): string => {
    let cleaned = num.trim();
    if (cleaned.length === 9 && !cleaned.startsWith('0')) return `+94${cleaned}`;
    if (cleaned.length === 10 && cleaned.startsWith('0')) return `+94${cleaned.substring(1)}`;
    return cleaned;
  };

  const handleSaveProfile = async () => {
    if (!nic || nic.trim().length < 10) {
      Alert.alert('Validation Error', 'Please enter a valid NIC number (Minimum 10 characters required).');
      return;
    }

    let payload: Partial<CompleteProfilePayload> = {};

    // 1. STUDENT Payload Structure mapping exactly to Postman Schema
    if (role === 'STUDENT') {
      if (!batch || !studentDepartment || !studentFullName || !studentPhone || !faculty || !universityRegNumber || !yearOfStudy) {
        Alert.alert('Validation Error', 'Please fill all required Student fields.');
        return;
      }

      const validatedPhone = formatPhoneNumber(studentPhone);

      payload = {
        role: "STUDENT",
        nic: nic.trim(), 
        phone: validatedPhone, 
        emergency_contact_name: studentFullName.trim(),
        emergency_contact_number: validatedPhone, 
        student_details: {
          university_reg_number: universityRegNumber.trim(),
          faculty: faculty.trim(),
          department: studentDepartment,
          year_of_study: yearStringToInt(yearOfStudy), 
          batch: batch.trim()
        }
      };
    }

    // 2. ACADEMIC STAFF Payload Structure mapping exactly to Postman Schema
    if (role === 'ACADEMIC_STAFF') {
      if (!universityStaffId || !staffDepartment || !staffFullName || !staffPhone || !position) {
        Alert.alert('Validation Error', 'Please fill all required Academic Staff fields.');
        return;
      }

      const validatedPhone = formatPhoneNumber(staffPhone);
      const finalEmail = staffEmail.trim() || `${universityStaffId.toLowerCase().replace(/[^a-z0-9]/g, "")}@eng.ruh.ac.lk`;

      payload = {
        role: "ACADEMIC_STAFF",
        nic: nic.trim(), 
        phone: validatedPhone,
        emergency_contact_name: staffFullName.trim(),
        emergency_contact_number: validatedPhone,
        academic_staff_details: { 
          university_staff_id: universityStaffId.trim(),
          department: staffDepartment,
          position: position,
          university_email: finalEmail,
          ExtraCertificateRecipient: extraCertificate.trim() !== "" ? extraCertificate.trim() : null
        }
      };
    }

    setIsLoading(true);
    try {
      const endpoint = `${API_URL}/api/users/complete-profile`; 
      
      console.log("🚀 Sending Patch Request to:", endpoint);
      console.log("📦 Payload:", JSON.stringify(payload, null, 2));

      const response = await fetch(endpoint, {
        method: 'PATCH', 
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log("📥 Response Status:", response.status);
      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error("❌ Non-JSON Response from Server:", responseText);
        Alert.alert('Server Error', 'Server returned non-JSON format. Check backend logs.');
        setIsLoading(false);
        return;
      }

      if (response.ok) {
        Alert.alert('Success', 'Profile completed successfully!', [
          { text: 'OK', onPress: () => router.push('/dashboard') }
        ]);
      } else {
        console.log("❌ Backend Validation Error Details:", responseData);
        Alert.alert('Update Failed', responseData.message || 'Validation failed.');
      }
    } catch (error) {
      Alert.alert('Network Error', 'Could not connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

        {/* HEADER */}
        <View style={styles.headerSection}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complete Registration</Text>
          <Text style={styles.headerSubtitle}>Account Detected: {role === 'STUDENT' ? 'Student' : 'Academic Staff'}</Text>
        </View>

        {/* FORM CARD */}
        <View style={styles.bottomCard}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.innerWhiteBox}>

              {/* TEST TOGGLE BUTTONS */}
              <View style={{flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15, backgroundColor: '#E8ECEC', padding: 5, borderRadius: 10}}>
                <TouchableOpacity onPress={() => setRole('STUDENT')} style={{padding: 8, backgroundColor: role === 'STUDENT' ? '#1D666A' : 'transparent', borderRadius: 8}}>
                  <Text style={{color: role === 'STUDENT' ? '#FFF' : '#000', fontSize: 12}}>Test Student Form</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setRole('ACADEMIC_STAFF')} style={{padding: 8, backgroundColor: role === 'ACADEMIC_STAFF' ? '#1D666A' : 'transparent', borderRadius: 8}}>
                  <Text style={{color: role === 'ACADEMIC_STAFF' ? '#FFF' : '#000', fontSize: 12}}>Test Staff Form</Text>
                </TouchableOpacity>
              </View>

              {/* NIC FIELD */}
              <Text style={styles.inputLabel}>National Identity Card (NIC) *</Text>
              <TextInput style={styles.inputBox} value={nic} onChangeText={setNic} placeholder="Enter at least 10 character NIC (e.g. 200112345678)" />

              {/* ── STUDENT FIELDS ─────────────────────────────────────── */}
              {role === 'STUDENT' && (
                <View style={styles.conditionalSection}>
                  <Text style={styles.sectionHeading}>Student Details</Text>

                  <Text style={styles.inputLabel}>Full Name *</Text>
                  <TextInput style={styles.inputBox} value={studentFullName} onChangeText={setStudentFullName} placeholder="Enter your full name" />

                  <Text style={styles.inputLabel}>Phone Number *</Text>
                  <TextInput style={styles.inputBox} value={studentPhone} onChangeText={setStudentPhone} keyboardType="phone-pad" placeholder="Enter phone number" />

                  <Text style={styles.inputLabel}>Department *</Text>
                  <TouchableOpacity style={styles.dropdownSelector} onPress={() => setShowStudentDeptDropdown(!showStudentDeptDropdown)}>
                    <Text style={studentDepartment ? styles.selectedText : styles.placeholderText}>{studentDepartment || 'Choose Department'}</Text>
                    <Ionicons name={showStudentDeptDropdown ? 'chevron-up' : 'chevron-down'} size={20} color="#757575" />
                  </TouchableOpacity>
                  {showStudentDeptDropdown && (
                    <View style={styles.dropdownMenuBox}>
                      {departments.map((item) => (
                        <TouchableOpacity key={item} style={styles.dropdownOption} onPress={() => { setStudentDepartment(item); setShowStudentDeptDropdown(false); }}>
                          <Text style={styles.dropdownOptionText}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={styles.inputLabel}>Faculty *</Text>
                  <TextInput style={styles.inputBox} value={faculty} onChangeText={setFaculty} placeholder="e.g., Engineering" />

                  <Text style={styles.inputLabel}>University Email</Text>
                  <TextInput style={styles.inputBox} value={studentEmail} onChangeText={setStudentEmail} keyboardType="email-address" autoCapitalize="none" placeholder="student@uni.edu (optional)" />

                  <Text style={styles.inputLabel}>University Reg Number *</Text>
                  <TextInput style={styles.inputBox} value={universityRegNumber} onChangeText={setUniversityRegNumber} autoCapitalize="characters" placeholder="e.g., EG/2023/5503" />

                  <Text style={styles.inputLabel}>Batch *</Text>
                  <TextInput style={styles.inputBox} value={batch} onChangeText={setBatch} placeholder="e.g., DEIE-Batch-23" />

                  <Text style={styles.inputLabel}>Year of Studying *</Text>
                  <TouchableOpacity style={styles.dropdownSelector} onPress={() => setShowYearDropdown(!showYearDropdown)}>
                    <Text style={yearOfStudy ? styles.selectedText : styles.placeholderText}>{yearOfStudy || 'Choose Year'}</Text>
                    <Ionicons name={showYearDropdown ? 'chevron-up' : 'chevron-down'} size={20} color="#757575" />
                  </TouchableOpacity>
                  {showYearDropdown && (
                    <View style={styles.dropdownMenuBox}>
                      {studyYears.map((item) => (
                        <TouchableOpacity key={item} style={styles.dropdownOption} onPress={() => { setYearOfStudy(item); setShowYearDropdown(false); }}>
                          <Text style={styles.dropdownOptionText}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* ── ACADEMIC STAFF FIELDS ──────────────────────────────── */}
              {role === 'ACADEMIC_STAFF' && (
                <View style={styles.conditionalSection}>
                  <Text style={styles.sectionHeading}>Academic Staff Details</Text>

                  <Text style={styles.inputLabel}>Full Name *</Text>
                  <TextInput style={styles.inputBox} value={staffFullName} onChangeText={setStaffFullName} placeholder="Enter your full name" />

                  <Text style={styles.inputLabel}>Phone Number *</Text>
                  <TextInput style={styles.inputBox} value={staffPhone} onChangeText={setStaffPhone} keyboardType="phone-pad" placeholder="Enter phone number" />

                  <Text style={styles.inputLabel}>University Staff ID *</Text>
                  <TextInput style={styles.inputBox} value={universityStaffId} onChangeText={setUniversityStaffId} placeholder="e.g., ACAD-ENG-078" />

                  <Text style={styles.inputLabel}>Department *</Text>
                  <TouchableOpacity style={styles.dropdownSelector} onPress={() => setShowStaffDeptDropdown(!showStaffDeptDropdown)}>
                    <Text style={staffDepartment ? styles.selectedText : styles.placeholderText}>{staffDepartment || 'Choose Department'}</Text>
                    <Ionicons name={showStaffDeptDropdown ? 'chevron-up' : 'chevron-down'} size={20} color="#757575" />
                  </TouchableOpacity>
                  {showStaffDeptDropdown && (
                    <View style={styles.dropdownMenuBox}>
                      {departments.map((item) => (
                        <TouchableOpacity key={item} style={styles.dropdownOption} onPress={() => { setStaffDepartment(item); setShowStaffDeptDropdown(false); }}>
                          <Text style={styles.dropdownOptionText}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={styles.inputLabel}>Position *</Text>
                  <TouchableOpacity style={styles.dropdownSelector} onPress={() => setShowPosDropdown(!showPosDropdown)}>
                    <Text style={position ? styles.selectedText : styles.placeholderText}>{position || 'Choose Position'}</Text>
                    <Ionicons name={showPosDropdown ? 'chevron-up' : 'chevron-down'} size={20} color="#757575" />
                  </TouchableOpacity>
                  {showPosDropdown && (
                    <View style={styles.dropdownMenuBox}>
                      {positions.map((item) => (
                        <TouchableOpacity key={item} style={styles.dropdownOption} onPress={() => { setPosition(item); setShowPosDropdown(false); }}>
                          <Text style={styles.dropdownOptionText}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={styles.inputLabel}>University Email</Text>
                  <TextInput style={styles.inputBox} value={staffEmail} onChangeText={setStaffEmail} keyboardType="email-address" autoCapitalize="none" placeholder="staff@uni.edu (optional)" />

                  <Text style={styles.inputLabel}>Extra Certificate</Text>
                  <TextInput style={styles.inputBox} value={extraCertificate} onChangeText={setExtraCertificate} placeholder="e.g., PhD, MSc (optional)" />
                </View>
              )}

              <View style={{ height: 30 }} />

              {/* SAVE BUTTON */}
              <TouchableOpacity style={styles.primaryButton} onPress={handleSaveProfile} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save & Complete</Text>}
              </TouchableOpacity>

            </View>
          </ScrollView>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1D666A' },
  headerSection: { paddingHorizontal: 30, paddingTop: 10, paddingBottom: 20 },
  backButton: { marginBottom: 15, width: 40 },
  headerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold', marginBottom: 6 },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 14 },
  bottomCard: { flex: 1, backgroundColor: '#E8ECEC', borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  scrollContent: { padding: 30 },
  innerWhiteBox: { backgroundColor: '#FFFFFF', borderRadius: 30, padding: 20 },
  inputLabel: { fontSize: 13, color: '#000000', fontWeight: '600', marginBottom: 8, marginTop: 12 },
  inputBox: { height: 48, backgroundColor: '#E0E0E0', borderRadius: 12, paddingHorizontal: 15, fontSize: 15, color: '#000000', marginBottom: 10 },
  dropdownSelector: { height: 48, backgroundColor: '#E0E0E0', borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, marginBottom: 10 },
  placeholderText: { color: '#757575', fontSize: 15 },
  selectedText: { color: '#000000', fontSize: 15, fontWeight: '500' },
  dropdownMenuBox: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#E0E0E0' },
  dropdownOption: { paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  dropdownOptionText: { fontSize: 15, color: '#000000' },
  primaryButton: { height: 50, backgroundColor: '#1D666A', borderRadius: 15, justifyContent: 'center', alignItems: 'center', width: '100%' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  conditionalSection: { marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  sectionHeading: { fontSize: 18, fontWeight: 'bold', color: '#1D666A', marginBottom: 10 },
});