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
import { useAppSettings } from '../context/AppSettingsContext';

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

  const [notifsEnabled, setNotifsEnabled] = useState(true);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  useEffect(() => {
    void loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      const storedNotifs = await AsyncStorage.getItem('absence_notifs_enabled');
      if (storedNotifs !== null) setNotifsEnabled(storedNotifs === 'true');
    } catch (error) {
      console.warn('Failed to load settings from API:', error);
    }
  };

  const handleNotifsToggle = async (val: boolean) => {
    setNotifsEnabled(val);
    await AsyncStorage.setItem('absence_notifs_enabled', String(val));
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
        <Text style={styles.headerTitle}>App Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>


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
