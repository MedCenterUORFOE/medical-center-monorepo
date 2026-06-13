import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StatusBar 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; 
import { Ionicons } from '@expo/vector-icons'; 
import { useRouter } from 'expo-router';

// Define strict type boundaries for the input field properties
interface InputFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  isPassword?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

const InputField: React.FC<InputFieldProps> = ({ 
  label, value, onChangeText, isPassword = false, keyboardType = 'default', autoCapitalize = 'none' 
}) => (
  <View style={styles.inputContainer}>
    <Text style={styles.inputLabel}>{label}</Text>
    <View style={{ height: 6 }} />
    <View style={styles.inputBox}>
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={isPassword}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  </View>
);

export default function CreateAccountScreen() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [role, setRole] = useState<string>(''); // Stores 'STUDENT' or 'ACADEMIC_STAFF'
  const [showRoleDropdown, setShowRoleDropdown] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const router = useRouter();
  
  // ✅ Removed hardcoded URL string. Dynamically reading endpoint from mobile .env package
  const API_URL = process.env.EXPO_PUBLIC_API_URL;

  const isStrongPassword = (pass: string): boolean => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(pass);
    const hasLowerCase = /[a-z]/.test(pass);
    const hasNumbers = /\d/.test(pass);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(pass);

    return pass.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
  };

  const handleCreateAccount = async () => {
    if (!email || !password || !confirmPassword || !role) {
      Alert.alert('Validation Error', 'Please fill all fields and select a role.');
      return;
    }

    if (!isStrongPassword(password)) {
      Alert.alert(
        'Weak Password', 
        'Please include a strong password.\n\nYour password must have:\n- At least 8 characters\n- One Uppercase letter\n- One Lowercase letter\n- One Number\n- One Special Character (!@#$)'
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        name: "New User", 
        email: email.trim(),
        password: password,
        role: role, 
        phone: "0000000000",
        nic: "Not Provided",
        emergency_contact_name: "N/A",
        emergency_contact_number: "0000000000",
        university_reg_number: "PENDING", 
        faculty: "Pending",
        batch: "Pending"
      };

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        Alert.alert('Success', 'Account created! Please log in.', [{ text: 'OK', onPress: () => router.push('/login') }]);
      } else {
        const errorData = await response.json();
        Alert.alert('Registration Failed', errorData.message || 'Email already exists or check your data.');
      }
    } catch (e) {
      Alert.alert('Error', 'Network connection failed. Check your environment configuration.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        
        {/* Header Section */}
        <View style={styles.headerSection}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Account</Text>
          <Text style={styles.headerSubtitle}>join UniMed Community</Text>
        </View>

        {/* Form Section */}
        <View style={styles.bottomCard}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.innerWhiteBox}>
              
              <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
              
              {/* Dynamic Dropdown Field Container */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Select Your Role *</Text>
                <View style={{ height: 6 }} />
                <TouchableOpacity style={styles.dropdownSelector} onPress={() => setShowRoleDropdown(!showRoleDropdown)}>
                  <Text style={role ? styles.selectedText : styles.placeholderText}>
                    {role === 'ACADEMIC_STAFF' ? 'Academic Staff' : role === 'STUDENT' ? 'Student' : 'Choose Role'}
                  </Text>
                  <Ionicons name={showRoleDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#757575" />
                </TouchableOpacity>
                {showRoleDropdown && (
                  <View style={styles.dropdownMenuBox}>
                    {['STUDENT', 'ACADEMIC_STAFF'].map((item) => (
                      <TouchableOpacity key={item} style={styles.dropdownOption} onPress={() => { setRole(item); setShowRoleDropdown(false); }}>
                        <Text style={styles.dropdownOptionText}>{item === 'ACADEMIC_STAFF' ? 'Academic Staff' : 'Student'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <InputField label="Password" value={password} onChangeText={setPassword} isPassword={true} />
              <InputField label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} isPassword={true} />

              <View style={{ height: 20 }} />

              <TouchableOpacity style={styles.primaryButton} onPress={handleCreateAccount} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Create Account</Text>}
              </TouchableOpacity>

            </View>

            <View style={{ height: 30 }} />
            
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/login')}>
                <Text style={styles.footerLink}>Sign In</Text>
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
  headerTitle: { color: '#FFFFFF', fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 16 },
  bottomCard: { flex: 1, backgroundColor: '#E8ECEC', borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  scrollContent: { padding: 30 },
  innerWhiteBox: { backgroundColor: '#FFFFFF', borderRadius: 30, padding: 20 },
  inputContainer: { marginBottom: 15 },
  inputLabel: { fontSize: 12, color: '#000000', fontWeight: '500' },
  inputBox: { height: 45, backgroundColor: '#E0E0E0', borderRadius: 10, justifyContent: 'center', paddingHorizontal: 15 },
  textInput: { flex: 1, fontSize: 14, color: '#000000' },
  dropdownSelector: { height: 45, backgroundColor: '#E0E0E0', borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15 },
  placeholderText: { color: '#757575', fontSize: 14 },
  selectedText: { color: '#000000', fontSize: 14, fontWeight: '500' },
  dropdownMenuBox: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 5, marginTop: 5, borderWidth: 1, borderColor: '#E0E0E0' },
  dropdownOption: { paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  dropdownOptionText: { fontSize: 14, color: '#000000' },
  primaryButton: { height: 50, backgroundColor: '#1D666A', borderRadius: 15, justifyContent: 'center', alignItems: 'center', width: '100%' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  footerContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: 'rgba(0, 0, 0, 0.87)', fontSize: 15 },
  footerLink: { color: '#1D666A', fontWeight: 'bold', fontSize: 15 },
});