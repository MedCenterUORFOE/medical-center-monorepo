import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';

const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?name=Patient&background=0D8ABC&color=fff';

export default function ProfileScreen() {

  // Basic Info States (Read-Only from API/Auth)
  const [patientId, setPatientId] = useState<string | null>(null);

  // Editable Profile States (Saved to AsyncStorage)
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // Modal UI States
  const [isPhotoSheetVisible, setIsPhotoSheetVisible] = useState(false);

  useEffect(() => {
    async function init() {
      const id = await SecureStore.getItemAsync('userId');
      setPatientId(id);

      // Load details from local storage cache
      const storedPhone = await AsyncStorage.getItem('phone_number');
      const storedContactName = await AsyncStorage.getItem('emergency_contact_name');
      const storedContactPhone = await AsyncStorage.getItem('emergency_contact_phone');
      const storedAvatar = await AsyncStorage.getItem('avatar_uri');
      
      if (storedPhone) setPhoneNumber(storedPhone);
      if (storedContactName) setEmergencyContactName(storedContactName);
      if (storedContactPhone) setEmergencyContactPhone(storedContactPhone);
      if (storedAvatar) setAvatarUri(storedAvatar);
    }
    init();
  }, []);

  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['profile', patientId],
    queryFn: async () => {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${API_URL}/api/profiles/${patientId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch profile');
      const raw = await response.json();
      const patientData = raw.data?.patient;
      if (patientData) {
        if (patientData.student) {
          return {
            role: 'Student',
            full_name: patientData.student.full_name || patientData.student.name || patientData.name || 'Student',
            id_number: patientData.student.university_reg_number || 'N/A',
          };
        } else if (patientData.staff || patientData.academic_staff) {
          const staffObj = patientData.staff || patientData.academic_staff;
          return {
            role: 'Academic Staff',
            full_name: staffObj.full_name || staffObj.name || patientData.name || 'Academic Staff',
            id_number: staffObj.staff_id || staffObj.employee_id || 'N/A',
          };
        }
        return {
          role: 'Patient',
          full_name: patientData.name || 'Patient',
          id_number: 'N/A',
        };
      }
      return null;
    },
    enabled: !!patientId,
  });

  const handleSaveDetails = async () => {
    try {
      await AsyncStorage.setItem('phone_number', phoneNumber.trim());
      await AsyncStorage.setItem('emergency_contact_name', emergencyContactName.trim());
      await AsyncStorage.setItem('emergency_contact_phone', emergencyContactPhone.trim());
      Alert.alert('Details Saved', 'Your personal details have been updated successfully.');
    } catch (e) {
      Alert.alert('Save Error', 'Failed to store your profile updates locally.');
    }
  };

  const handleImagePick = async (useCamera: boolean) => {
    setIsPhotoSheetVisible(false);
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera permission is required to take photos.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.5,
          legacy: true,
        });
        if (!result.canceled) {
          setAvatarUri(result.assets[0].uri);
          await AsyncStorage.setItem('avatar_uri', result.assets[0].uri);
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Gallery permission is required to select photos.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.5,
          legacy: true,
        });
        if (!result.canceled) {
          setAvatarUri(result.assets[0].uri);
          await AsyncStorage.setItem('avatar_uri', result.assets[0].uri);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* SECTION 1: PROFILE PICTURE & BASIC INFO */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarRing}>
            <Image source={{ uri: avatarUri || DEFAULT_AVATAR }} style={styles.avatarImage} />
            <TouchableOpacity
              style={styles.cameraIconPill}
              onPress={() => setIsPhotoSheetVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {isProfileLoading ? (
            <ActivityIndicator size="small" color="#1B5E55" style={{ marginTop: 10 }} />
          ) : (
            <>
              <Text style={styles.userNameText}>{profile?.full_name || 'Patient'}</Text>
              <Text style={styles.userIdText}>
                {profile?.role === 'Student' 
                  ? `Student ID: ${profile.id_number}` 
                  : profile?.role === 'Academic Staff' 
                    ? `Staff ID: ${profile.id_number}` 
                    : 'Patient Profile'}
              </Text>
            </>
          )}
        </View>

        {/* SECTION 2: PERSONAL DETAILS */}
        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Personal Details</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="call-outline" size={20} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Your Phone Number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              value={emergencyContactName}
              onChangeText={setEmergencyContactName}
              placeholder="Emergency Contact Name"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="alert-circle-outline" size={20} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              value={emergencyContactPhone}
              onChangeText={setEmergencyContactPhone}
              placeholder="Emergency Contact Number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
            />
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSaveDetails} activeOpacity={0.8}>
            <Ionicons name="save-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.saveButtonText}>Save Personal Details</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>


      {/* ACTION SHEET MODAL: PHOTO OPTIONS */}
      <Modal
        visible={isPhotoSheetVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsPhotoSheetVisible(false)}
      >
        <View style={styles.photoSheetOverlay}>
          <View style={styles.photoSheetContent}>
            <Text style={styles.photoSheetTitle}>Update Profile Photo</Text>

            <TouchableOpacity style={styles.photoSheetOption} onPress={() => handleImagePick(true)} activeOpacity={0.7}>
              <Ionicons name="camera-outline" size={22} color="#0284C7" />
              <Text style={styles.photoSheetOptionText}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoSheetOption} onPress={() => handleImagePick(false)} activeOpacity={0.7}>
              <Ionicons name="image-outline" size={22} color="#0284C7" />
              <Text style={styles.photoSheetOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.photoSheetOption, styles.photoSheetCancel]}
              onPress={() => setIsPhotoSheetVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.photoSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  avatarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    marginBottom: 20,
  },
  avatarRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  avatarImage: {
    width: 98,
    height: 98,
    borderRadius: 49,
  },
  avatarFallback: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIconPill: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284C7',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  userNameText: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  userIdText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  settingsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    paddingVertical: 12,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    borderRadius: 16,
    paddingVertical: 13,
    marginTop: 6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  toggleCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  toggleTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  toggleLabel: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  toggleDescription: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  pinActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pinChangeBtn: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pinChangeText: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: '700',
  },
  pinDisableBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pinDisableText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  pinSetupBtn: {
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pinSetupText: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: '700',
  },
  dangerSection: {
    marginBottom: 20,
  },
  dangerSectionTitle: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
    paddingLeft: 4,
  },
  dangerCard: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FEE2E2',
    borderWidth: 1.5,
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  dangerDivider: {
    height: 1.5,
    backgroundColor: '#FEE2E2',
  },
  deactivateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  deactivateButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  modalBody: {
    alignItems: 'center',
    width: '100%',
  },
  modalLabel: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  pinInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    width: '100%',
    marginBottom: 18,
  },
  savePinBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 16,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
  },
  savePinBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  photoSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  photoSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
  },
  photoSheetTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 20,
  },
  photoSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    gap: 12,
  },
  photoSheetOptionText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  photoSheetCancel: {
    marginTop: 8,
    borderBottomWidth: 0,
    justifyContent: 'center',
  },
  photoSheetCancelText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '800',
  },
});
