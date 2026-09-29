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
import { useAppSettings } from '../context/AppSettingsContext';

const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

export default function SettingsScreen() {
  const router = useRouter();
  const {
    biometricsEnabled,
    setBiometricsEnabled,
    pinEnabled,
    setPinCode,
    disablePinCode,
    logout,
  } = useAppSettings();

  // Basic Info States (Read-Only from API/Auth)
  const [fullName, setFullName] = useState('Loading...');
  const [studentId, setStudentId] = useState('');
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);

  // Editable Profile States (Saved to AsyncStorage)
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // Toggles and Custom App Configurations
  const [notifsEnabled, setNotifsEnabled] = useState(true);

  // Modal UI States
  const [isPhotoSheetVisible, setIsPhotoSheetVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  useEffect(() => {
    void loadProfileData();
  }, []);

  const loadProfileData = async () => {
    setIsLoadingInfo(true);
    try {
      // 1. Load details from local storage cache
      const storedPhone = await AsyncStorage.getItem('phone_number');
      const storedContactName = await AsyncStorage.getItem('emergency_contact_name');
      const storedContactPhone = await AsyncStorage.getItem('emergency_contact_phone');
      const storedAvatar = await AsyncStorage.getItem('avatar_uri');
      const storedNotifs = await AsyncStorage.getItem('absence_notifs_enabled');

      if (storedPhone) setPhoneNumber(storedPhone);
      if (storedContactName) setEmergencyContactName(storedContactName);
      if (storedContactPhone) setEmergencyContactPhone(storedContactPhone);
      if (storedAvatar) setAvatarUri(storedAvatar);
      if (storedNotifs !== null) setNotifsEnabled(storedNotifs === 'true');

      // 2. Load Student Name & ID from patient profile API endpoint
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const token = await SecureStore.getItemAsync('userToken');
      const userId = await SecureStore.getItemAsync('userId');

      if (apiUrl && token && userId) {
        const response = await fetch(`${apiUrl}/api/profiles/${userId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const payload = await response.json();
          const patientData = payload?.data?.patient;
          if (patientData) {
            setFullName(patientData.student?.full_name || patientData.student?.name || patientData.name || 'Student Patient');
            setStudentId(patientData.student?.university_reg_number || 'N/A');
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load profile details from API:', error);
    } finally {
      setIsLoadingInfo(false);
    }
  };

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

  const handleNotifsToggle = async (val: boolean) => {
    setNotifsEnabled(val);
    await AsyncStorage.setItem('absence_notifs_enabled', String(val));
  };

  const handleImagePick = async (useCamera: boolean) => {
    // 1. Close modal first
    setIsPhotoSheetVisible(false);
    
    // 2. Wait for modal animation to fully close to prevent navigation/rendering clash
    await new Promise((resolve) => setTimeout(resolve, 350));
    
    try {
      let permissionResult;
      if (useCamera) {
        permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera and gallery access is required to update your profile photo.');
        return;
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      };

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedUri = result.assets[0].uri;
        setAvatarUri(selectedUri);
        await AsyncStorage.setItem('avatar_uri', selectedUri);
      }
    } catch (e) {
      Alert.alert('Picker Error', 'An error occurred while launching image selection.');
    }
  };

  const handlePinSetup = async () => {
    if (pinInput.length !== 4 || pinConfirm.length !== 4) {
      Alert.alert('PIN Error', 'PIN must be exactly 4 digits.');
      return;
    }
    if (pinInput !== pinConfirm) {
      Alert.alert('Mismatch', 'PIN code and confirmation do not match.');
      return;
    }

    try {
      await setPinCode(pinInput);
      setIsPinModalVisible(false);
      setPinInput('');
      setPinConfirm('');
      Alert.alert('Security PIN Set', 'Your security PIN has been successfully enabled.');
    } catch (e) {
      Alert.alert('Error', 'Unable to enable security PIN.');
    }
  };

  const handleDisablePin = async () => {
    Alert.alert('Disable Security PIN', 'Are you sure you want to disable the application PIN code lock?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable PIN',
        style: 'destructive',
        onPress: async () => {
          await disablePinCode();
          Alert.alert('Security PIN Disabled', 'Application PIN lock has been disabled.');
        },
      },
    ]);
  };

  const handleDeactivateAccount = () => {
    Alert.alert(
      'Deactivate Account Request',
      'This will submit a request to the University Medical Center administrator to deactivate your patient account. Are you sure you wish to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Deactivation',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Request Submitted', 'Your deactivation request has been logged. Admin will review the request within 2-3 business days.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account & Settings</Text>
        <View style={{ width: 40 }} />
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

          <Text style={styles.userNameText}>{fullName}</Text>
          <Text style={styles.userIdText}>{studentId ? `Student ID: ${studentId}` : 'Faculty Student Profile'}</Text>
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

        {/* SECTION 3: SECURITY & APP SETTINGS */}
        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Security & App Settings</Text>

          {/* Biometrics Toggle */}
          <View style={styles.toggleCard}>
            <View style={styles.toggleCardLeft}>
              <MaterialCommunityIcons name="fingerprint" size={24} color="#0284C7" />
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleLabel}>Biometric Authentication</Text>
                <Text style={styles.toggleDescription}>Lock app with Face ID or Fingerprint</Text>
              </View>
            </View>
            <Switch
              value={biometricsEnabled}
              onValueChange={setBiometricsEnabled}
              trackColor={{ false: '#CBD5E1', true: '#BAE6FD' }}
              thumbColor={biometricsEnabled ? '#0284C7' : '#94A3B8'}
            />
          </View>

          {/* App PIN Code */}
          <View style={styles.toggleCard}>
            <View style={styles.toggleCardLeft}>
              <Feather name="shield" size={22} color="#0284C7" style={{ paddingLeft: 1 }} />
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleLabel}>Security PIN Lock</Text>
                <Text style={styles.toggleDescription}>Require a 4-Digit PIN to unlock app</Text>
              </View>
            </View>
            {pinEnabled ? (
              <View style={styles.pinActionsRow}>
                <TouchableOpacity style={styles.pinChangeBtn} onPress={() => setIsPinModalVisible(true)} activeOpacity={0.7}>
                  <Text style={styles.pinChangeText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pinDisableBtn} onPress={handleDisablePin} activeOpacity={0.7}>
                  <Text style={styles.pinDisableText}>Disable</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.pinSetupBtn} onPress={() => setIsPinModalVisible(true)} activeOpacity={0.7}>
                <Text style={styles.pinSetupText}>Setup</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Push Notifications Toggle */}
          <View style={styles.toggleCard}>
            <View style={styles.toggleCardLeft}>
              <Ionicons name="notifications-outline" size={22} color="#0284C7" />
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleLabel}>Absence Alerts</Text>
                <Text style={styles.toggleDescription}>Receive absence justification approvals</Text>
              </View>
            </View>
            <Switch
              value={notifsEnabled}
              onValueChange={handleNotifsToggle}
              trackColor={{ false: '#CBD5E1', true: '#BAE6FD' }}
              thumbColor={notifsEnabled ? '#0284C7' : '#94A3B8'}
            />
          </View>
        </View>

        {/* SECTION 4: DANGER ZONE */}
        <View style={styles.dangerSection}>
          <Text style={styles.dangerSectionTitle}>Danger Zone</Text>

          <View style={styles.dangerCard}>
            <TouchableOpacity style={styles.logoutButton} onPress={logout} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={20} color="#DC2626" />
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </TouchableOpacity>

            <View style={styles.dangerDivider} />

            <TouchableOpacity style={styles.deactivateButton} onPress={handleDeactivateAccount} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
              <Text style={styles.deactivateButtonText}>Deactivate Account Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* POPUP MODAL: PIN CODE SETUP */}
      <Modal
        visible={isPinModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPinModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set 4-Digit Security PIN</Text>
              <TouchableOpacity onPress={() => setIsPinModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>Enter New PIN</Text>
              <TextInput
                style={styles.pinInput}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                value={pinInput}
                onChangeText={setPinInput}
                placeholder="••••"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.modalLabel}>Confirm PIN</Text>
              <TextInput
                style={styles.pinInput}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                value={pinConfirm}
                onChangeText={setPinConfirm}
                placeholder="••••"
                placeholderTextColor="#94A3B8"
              />

              <TouchableOpacity style={styles.savePinBtn} onPress={handlePinSetup} activeOpacity={0.8}>
                <Text style={styles.savePinBtnText}>Enable PIN Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
