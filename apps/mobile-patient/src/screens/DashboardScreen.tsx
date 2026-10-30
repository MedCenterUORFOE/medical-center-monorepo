import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, FontAwesome5, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../theme/colors';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { getUnreadCount, subscribe } from '../notifications/notificationStore';

// ── TypeScript Data Interfaces ──
interface ProfileSchema {
  full_name: string;
  surname: string;
  student_id: string;
  faculty: string;
  avatar_url?: string | null;
  is_profile_complete: boolean;
}

const extractSurname = (nameStr?: string | null): string => {
  if (!nameStr) return '';
  const trimmed = nameStr.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] || '';
};

// ✅ Changed to match new Database Field names
interface AppointmentSchema {

  id?: string;
  appointment_id?: string;
  //appointment_id: string; 
  scheduled_time: string;
  status: string;
  doctor?: {
    staff?: {
      user?: {
        name?: string;
      }
    },
    specialization?: string;
  };
}

interface MedicalRecordSchema {
  id: string;
  visit_date_time?: string;
  visit_date?: string;
  diagnosis: string;
  symptoms?: string | null;
  treatment_plan?: string | null;
  prescription_notes?: string | null;
  follow_up_date?: string | null;
}

const isUpcoming = (appointment: AppointmentSchema) => {
  if (!appointment.scheduled_time) return true;
  const d = new Date(appointment.scheduled_time);
  if (isNaN(d.getTime())) return true;
  return d >= new Date();
};

export default function PatientDashboard() {
  const router = useRouter();

  const [patientId, setPatientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'CONSULTATIONS' | 'TIMELINE'>('CONSULTATIONS');
  const [greeting, setGreeting] = useState<string>('');
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [imageError, setImageError] = useState<boolean>(false);

  const loadUnreadCount = async () => {
    const count = await getUnreadCount();
    setUnreadNotifCount(count);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadUnreadCount();
      async function syncSessionAndData() {
        const id =
          (await SecureStore.getItemAsync('userId')) ||
          (await AsyncStorage.getItem('userId'));
        setPatientId(id);
        setImageError(false);
        void fetchDashboardDataFromBackend();
      }
      void syncSessionAndData();
      const unsubscribe = subscribe(loadUnreadCount);
      return () => unsubscribe();
    }, [])
  );
  const [isConfirmEmergencyModalVisible, setIsConfirmEmergencyModalVisible] = useState<boolean>(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    configureClockGreeting();
    async function loadAuth() {
      const id =
        (await SecureStore.getItemAsync('userId')) ||
        (await AsyncStorage.getItem('userId'));
      setPatientId(id);
    }
    loadAuth();
  }, []);

  const configureClockGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  };

  // ── REACT QUERY HOOKS FOR CACHING & OFFLINE CAPABILITY ──

  // 1. Profile Query
  const { data: profile = null, isLoading: isProfileLoading, refetch: refetchProfile } = useQuery<ProfileSchema | null>({
    queryKey: ['profile', patientId],
    queryFn: async () => {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token =
        (await SecureStore.getItemAsync('userToken')) ||
        (await AsyncStorage.getItem('userToken'));

      // 1. Read local cache / overrides scoped to CURRENT patientId
      let localOverrides: any = null;
      let localProfile: any = null;
      let localUserData: any = null;
      let completedFlag: string | null = null;
      let localAvatarUrl: string | null = null;
      let isAvatarReset = false;

      if (patientId) {
        const [rawOverrides, rawProfile, rawUser, rawCompleted, rawAvatar, rawReset] = await Promise.all([
          AsyncStorage.getItem(`patient_profile_overrides_${patientId}`),
          AsyncStorage.getItem(`patientProfile_${patientId}`),
          AsyncStorage.getItem('userData'),
          AsyncStorage.getItem(`profileCompleted_${patientId}`),
          AsyncStorage.getItem(`patient_avatar_${patientId}`),
          AsyncStorage.getItem(`patient_avatar_reset_${patientId}`),
        ]);
        localOverrides = rawOverrides ? JSON.parse(rawOverrides) : null;
        localProfile = rawProfile ? JSON.parse(rawProfile) : null;
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;
        // Verify localUserData belongs to THIS patientId to prevent cross-user leakage
        if (parsedUser && (!parsedUser.id || parsedUser.id === patientId)) {
          localUserData = parsedUser;
        }
        completedFlag = rawCompleted;
        localAvatarUrl = rawAvatar || null;
        isAvatarReset = rawReset === 'true';
      }

      // 2. Fetch remote profile
      let patientData: any = null;
      try {
        const response = await fetch(`${API_URL}/api/profiles/${patientId}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const raw = await response.json();
          patientData = raw.data?.patient;
        }
      } catch (err) {
        console.warn('Dashboard profile fetch failed:', err);
      }

      // 3. Determine completion status strictly per instructions:
      // A user's profile must ONLY be considered complete (isProfileComplete = true) for the currently logged-in userId if:
      // (a) The backend GET /api/profiles response for this userId returns a valid PatientProfile that actually has
      //     core baseline fields populated (specifically checking that blood_group AND (date_of_birth OR height OR weight)
      //     are non-null/non-empty), OR
      // (b) The user-scoped key profileCompleted_${userId} in AsyncStorage is explicitly 'true' for this exact userId
      //     (set only when this user submits the Complete Profile / Edit Profile form), OR
      // (c) localProfile?.is_profile_complete === true for this exact patientId
      const clinicalProfile = patientData?.patientProfile;
      const hasBaselineClinicalFields = Boolean(
        clinicalProfile &&
        clinicalProfile.blood_group &&
        String(clinicalProfile.blood_group).trim() !== '' &&
        (
          (clinicalProfile.date_of_birth && String(clinicalProfile.date_of_birth).trim() !== '') ||
          (clinicalProfile.height !== null && clinicalProfile.height !== undefined && Number(clinicalProfile.height) > 0) ||
          (clinicalProfile.weight !== null && clinicalProfile.weight !== undefined && Number(clinicalProfile.weight) > 0)
        )
      );

      const hasUserCompletedLocally =
        completedFlag === 'true' ||
        localProfile?.is_profile_complete === true ||
        (localUserData?.is_profile_complete === true && localUserData?.id === patientId);

      const isProfileComplete = Boolean(hasBaselineClinicalFields || hasUserCompletedLocally);

      // 4. Resolve full name & surname accurately:
      // Saved custom surname from user profile edits:
      const savedSurname = localOverrides?.surname || localProfile?.surname;

      // Real account name from fresh Google Login / registration or backend:
      const accountName = patientData?.name || localUserData?.name;
      const isValidAccountName =
        accountName &&
        accountName.trim() !== '' &&
        accountName !== 'New User' &&
        accountName !== 'Unknown User';

      let resolvedSurname = '';
      if (savedSurname && isProfileComplete) {
        resolvedSurname = savedSurname;
      } else if (isValidAccountName) {
        resolvedSurname = accountName.trim();
      } else if (savedSurname) {
        resolvedSurname = savedSurname;
      } else if (patientData?.student?.full_name && patientData.student.full_name !== 'New User') {
        resolvedSurname = patientData.student.full_name;
      } else if (accountName && accountName.trim() !== '') {
        resolvedSurname = accountName.trim();
      } else {
        resolvedSurname = 'Patient';
      }

      const rawFullName =
        patientData?.name ||
        localUserData?.name ||
        savedSurname ||
        resolvedSurname;

      const studentId =
        patientData?.student?.university_reg_number && patientData.student.university_reg_number !== 'PENDING'
          ? patientData.student.university_reg_number
          : patientData?.academicStaff?.university_staff_id ||
            (localUserData?.id === patientId && localUserData?.reg_number !== 'PENDING' ? localUserData?.reg_number : '') ||
            '';

      const faculty =
        patientData?.student?.faculty && patientData.student.faculty !== 'Pending'
          ? patientData.student.faculty
          : patientData?.academicStaff?.department ||
            (localUserData?.id === patientId && localUserData?.faculty !== 'Pending' ? localUserData?.faculty : '') ||
            '';

      let resolvedAvatarUrl: string | null = null;
      if (!isAvatarReset) {
        resolvedAvatarUrl =
          localAvatarUrl ||
          patientData?.profile_picture ||
          (localUserData?.id === patientId ? (localUserData?.profile_picture || localUserData?.picture) : null) ||
          null;
      }

      return {
        full_name: rawFullName,
        surname: resolvedSurname,
        student_id: studentId,
        faculty: faculty,
        avatar_url: resolvedAvatarUrl,
        is_profile_complete: isProfileComplete,
      };
    },
    enabled: !!patientId,
  });

  // 2. Appointments Query
  const { data: appointmentsList = [], isLoading: isAppointmentsLoading, refetch: refetchAppointments } = useQuery<AppointmentSchema[]>({
    queryKey: ['appointments', patientId],
    queryFn: async () => {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${API_URL}/api/appointments`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch appointments');
      const raw = await response.json();
      const aptList = raw.data || raw.appointments || raw || [];
      if (Array.isArray(aptList)) {
        const upcoming = aptList.filter(apt => apt.status === 'SCHEDULED' || apt.status === 'confirmed');
        upcoming.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());
        return upcoming;
      }
      return [];
    },
    enabled: !!patientId,
  });

  // 3. Medical History Query
  const { data: medicalRecordsList = [], isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery<MedicalRecordSchema[]>({
    queryKey: ['medicalHistory', patientId],
    queryFn: async () => {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${API_URL}/api/records/history/${patientId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch history');
      const historyData = await response.json();
      return historyData.data?.history || historyData.data || historyData || [];
    },
    enabled: !!patientId,
  });

  const upcomingConsultations = appointmentsList.filter(isUpcoming);

  // Derived state mappings: strictly Boolean, defaults to false if uncompleted or loading
  const hasVerifiedProfile = Boolean(profile?.is_profile_complete);
  const nextAppointment = upcomingConsultations.length > 0 ? upcomingConsultations[0] : null;
  const isLoading = isProfileLoading || isAppointmentsLoading || isHistoryLoading || isMutating;

  const fetchDashboardDataFromBackend = async () => {
    await Promise.all([
      refetchProfile(),
      refetchAppointments(),
      refetchHistory()
    ]);
  };




  const handleCancelAppointment = async (appointmentId: string) => {
    Alert.alert('Confirm Cancellation', 'Are you sure you want to cancel this appointment?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setIsMutating(true);
          try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            const token = await SecureStore.getItemAsync('userToken');

            // ✅ Calling your route that updates Status
            const res = await fetch(`${API_URL}/api/appointments/${appointmentId}/status`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ status: 'CANCELLED' })
            });

            if (res.ok) {
              Alert.alert('Success', 'Appointment cancelled successfully.');
              fetchDashboardDataFromBackend(); // Refresh Data
            } else {
              Alert.alert('Error', 'Failed to cancel appointment.');
            }
          } catch (e) {
            Alert.alert('Error', 'Network connection failed.');
          } finally {
            setIsMutating(false);
          }
        }
      }
    ]);
  };



  // --- Panic Button Logic ---
  const handleEmergencyPressIn = () => {
    Animated.parallel([
      Animated.timing(progressAnim, { toValue: 1, duration: 3000, useNativeDriver: false }),
      Animated.timing(scaleAnim, { toValue: 1.04, duration: 3000, useNativeDriver: true })
    ]).start();

    timerRef.current = setTimeout(() => {
      executePanicBackendRequest();
    }, 3000);
  };

  const handleEmergencyPressOut = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(progressAnim, { toValue: 0, duration: 250, useNativeDriver: false }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 250, useNativeDriver: true })
    ]).start();
  };

  const callHotline = async (rawNumber: string = '0123456789') => {
    const cleanedNumber = rawNumber.replace(/[^\d+]/g, '');
    if (!cleanedNumber) return;
    try {
      await Linking.openURL(`tel:${cleanedNumber}`);
    } catch (e) {
      console.error('Failed to open dialer:', e);
      Alert.alert('Unable to Open Dialer', `Please dial ${rawNumber} manually.`);
    }
  };

  const sendEmergencyRequest = async () => {
    try {
      setIsMutating(true);

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location Required', 'Location permission is required to dispatch the ambulance.');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentPosition.coords;

      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = await SecureStore.getItemAsync('userToken');

      const response = await fetch(`${API_URL}/api/ambulance/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pickup_lat: latitude,
          pickup_lng: longitude,
        }),
      });

      const responseBody = await response.json();

      if (response.status === 201 || responseBody?.success === true) {
        const reqId = responseBody?.data?.id;
        const serverMsg = responseBody?.message || "";

        if (serverMsg.toLowerCase().includes("no driver")) {
          callHotline();
          return;
        }

        if (reqId) {
          await AsyncStorage.setItem('activeEmergencyRequestId', reqId);
          await AsyncStorage.setItem('activeEmergencyStatus', 'PENDING');
        }

        Alert.alert('Success', 'SOS Sent Successfully! We are finding the nearest ambulance.');
        router.push('/emergency' as any);
      } else {
        const errorMessage = responseBody?.message || 'Unable to dispatch ambulance.';
        Alert.alert(
          'Request Failed',
          `${errorMessage}\n\nCalling emergency hotline fallback...`,
          [{ text: 'Call', onPress: () => callHotline() }, { text: 'Cancel', style: 'cancel' }]
        );
      }
    } catch (error) {
      console.error("Emergency SOS Request Error:", error);
      Alert.alert(
        'Request Failed',
        'Network request failed. Calling emergency hotline fallback...',
        [{ text: 'Call', onPress: () => callHotline() }, { text: 'Cancel', style: 'cancel' }]
      );
    } finally {
      setIsMutating(false);
    }
  };

  const executePanicBackendRequest = async () => {
    await sendEmergencyRequest();
  };

  // ✅ Date and Time Formatting Helpers
  const formatDisplayDate = (dateStr?: string | null): string => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDisplayTime = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const isFollowUpOverdue = (dateStr?: string | null): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d < new Date();
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  const latestVisit = medicalRecordsList.length > 0 ? medicalRecordsList[0] : null;
  const currentHealthStatus = latestVisit ? latestVisit.diagnosis : 'Healthy';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.softSurface} />

      {/* ── 1. DYNAMIC HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingText}>{greeting},</Text>
            <Text style={styles.userName}>{profile?.surname || profile?.full_name || 'Patient'}</Text>
            {hasVerifiedProfile && (profile?.student_id || profile?.faculty) ? (
              <Text style={styles.studentIdSubTitleText}>
                {profile.student_id ? `${profile.student_id}  •  ` : ''}{profile.faculty}
              </Text>
            ) : null}
          </View>

          <View style={styles.headerRightActions}>
            <TouchableOpacity style={styles.bellWrap} onPress={() => router.push('/notifications' as any)} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={24} color={colors.textPrimary} />
              {unreadNotifCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.avatarBadgeOuter}
              onPress={() => router.push('/(tabs)/profile' as any)}
              activeOpacity={0.8}
            >
              <View style={styles.avatarBadgeInner}>
                {profile?.avatar_url && !imageError ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={styles.avatarImage}
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <Text style={styles.avatarInitialText}>
                    {(profile?.surname || profile?.full_name || 'U').trim().charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={{ flex: 1, zIndex: 10, elevation: 10, marginTop: hasVerifiedProfile ? -40 : 0 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

            {/* ── 2. DYNAMIC HEALTH STATUS CARD ── */}
            {hasVerifiedProfile && (
              <View style={styles.statusOverlapCard}>
                <View style={styles.statusLeftRow}>
                  <View style={styles.checkCircleGreenIconFrame}>
                    <Ionicons name="fitness-outline" size={32} color={colors.badges.records.icon} />
                  </View>
                  <View style={styles.statusLabelsTextContainer}>
                    <Text style={styles.statusHeadlineMainTextText} numberOfLines={1}>{currentHealthStatus}</Text>
                    {latestVisit && (
                      <Text style={styles.lastVisitStringMetaLabelText}>Last visit: {formatDisplayDate(latestVisit.visit_date)}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.nextAppointmentPillContainerPill}>
                  <Text style={styles.pillHeadingTitleLabelText}>Next Appt.</Text>
                  <Text style={styles.pillDateTimeStringValueText}>
                    {nextAppointment ? `${formatDisplayDate(nextAppointment.scheduled_time)}` : 'No upcoming'}
                  </Text>
                  {nextAppointment && (
                    <Text style={{ fontSize: 10, color: colors.primaryText, fontWeight: 'bold' }}>{formatDisplayTime(nextAppointment.scheduled_time)}</Text>
                  )}
                </View>
              </View>
            )}

            {/* ── UNVERIFIED PROFILE BANNER ── */}
            {!hasVerifiedProfile && (
              <TouchableOpacity style={styles.amberWarningCallout} onPress={() => router.push('/complete-profile' as any)}>
                <View style={styles.warningHeaderRow}>
                  <MaterialIcons name="warning" size={24} color={colors.warningText} />
                  <Text style={styles.warningTitleText}>Action Required</Text>
                </View>
                <Text style={styles.warningBodyText}>
                  Complete your registration process to unlock all clinical features.
                </Text>
              </TouchableOpacity>
            )}

            {/* ── 3. QUICK ACTIONS GRID ── */}
            <View style={styles.gridSectionSection}>
              <Text style={styles.sectionHeadingTitleMainLabel}>Quick Actions</Text>
              <View style={styles.gridMatrixRowWrapper}>
                <TouchableOpacity style={styles.gridActionCardElement} onPress={() => router.push('/(tabs)/appointment' as any)}>
                  <View style={[styles.iconBackgroundCircleWrapperFrame, { backgroundColor: colors.badges.appointment.background }]}>
                    <Feather name="calendar" size={22} color={colors.badges.appointment.icon} />
                  </View>
                  <Text style={styles.actionCardLabelContentString}>Book Appointment</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.gridActionCardElement} onPress={() => router.push('/(tabs)/prescriptions' as any)}>
                  <View style={[styles.iconBackgroundCircleWrapperFrame, { backgroundColor: colors.badges.prescriptions.background }]}>
                    <FontAwesome5 name="pills" size={20} color={colors.badges.prescriptions.icon} />
                  </View>
                  <Text style={styles.actionCardLabelContentString}>My Prescriptions</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.gridMatrixRowWrapper}>
                <TouchableOpacity style={styles.gridActionCardElement} onPress={() => router.push('/(tabs)/records' as any)}>
                  <View style={[styles.iconBackgroundCircleWrapperFrame, { backgroundColor: colors.badges.records.background }]}>
                    <Ionicons name="document-text-outline" size={22} color={colors.badges.records.icon} />
                  </View>
                  <Text style={styles.actionCardLabelContentString}>Medical Records</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.gridActionCardElement} onPress={() => router.push('/academic-submission' as any)}>
                  <View style={[styles.iconBackgroundCircleWrapperFrame, { backgroundColor: colors.badges.submission.background }]}>
                    <MaterialCommunityIcons name="certificate-outline" size={22} color={colors.badges.submission.icon} />
                  </View>
                  <Text style={styles.actionCardLabelContentString}>Medical Certificate</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── 4. SPLIT TAB MANAGER VIEW ── */}
            {hasVerifiedProfile && (
              <>
                <View style={styles.tabToggleRowBarContainer}>
                  <TouchableOpacity
                    style={[styles.segmentTabButton, activeTab === 'CONSULTATIONS' && styles.activeSegmentTabButton]}
                    onPress={() => setActiveTab('CONSULTATIONS')}
                  >
                    <Text style={[styles.tabLabelStringText, activeTab === 'CONSULTATIONS' && styles.activeTabLabelStringText]}>
                      Consultations ({upcomingConsultations.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentTabButton, activeTab === 'TIMELINE' && styles.activeSegmentTabButton]}
                    onPress={() => setActiveTab('TIMELINE')}
                  >
                    <Text style={[styles.tabLabelStringText, activeTab === 'TIMELINE' && styles.activeTabLabelStringText]}>
                      Medical Timeline
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.tabPanelBodyWrapper}>
                  {activeTab === 'CONSULTATIONS' ? (
                    upcomingConsultations.length === 0 ? (
                      <View style={styles.emptyStateCardView}>
                        <Text style={styles.emptyStateDescriptionLabelText}>No upcoming consultations</Text>
                        <TouchableOpacity style={styles.emptyStateActionButtonCtaPill} onPress={() => router.push('/book-appointment' as any)}>
                          <Text style={styles.ctaButtonLabelText}>Book one now</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      upcomingConsultations.map((item) => {
                      // 🚀 Here's the key part: Whatever name comes from the Backend, we get it accurately!
                      const validId = item.id || item.appointment_id;

                      return (
                        <View key={validId} style={styles.upcomingAppointmentCardWrapper}>
                          <View style={styles.cardHeaderFlexLineRow}>
                            <View style={styles.doctorAvatarCircleWrapperFramePlaceholder}>
                              <FontAwesome5 name="user-md" size={22} color={colors.primary} />
                            </View>
                            <View style={styles.doctorIdentityLabelsBlockText}>
                              
                          
                              <Text style={styles.doctorNameCardHeadlineText}>
                                {item.doctor?.staff?.user?.name?.startsWith('Dr') 
                                  ? item.doctor?.staff?.user?.name 
                                  : `Dr. ${item.doctor?.staff?.user?.name || 'Assigned Doctor'}`}
                              </Text>
                                                            <Text style={styles.doctorSpecialtySubTextLabelText}>
                                {item.doctor?.specialization || 'General Consultation'}
                              </Text>
                            </View>
                          </View>
                          
                          <View style={styles.appointmentTimeBadgeRowLinePill}>
                            <Ionicons name="time-outline" size={16} color={colors.primaryText} style={{ marginRight: 6 }} />
                            <Text style={styles.appointmentBadgeTimestampStringText}>
                              {formatDisplayDate(item.scheduled_time)} at {formatDisplayTime(item.scheduled_time)}
                            </Text>
                          </View>

                          <View style={styles.actionButtonSplitButtonContainerRow}>
                            <TouchableOpacity 
                              style={styles.outlinedRescheduleActionButtonElement}
                                  onPress={() => router.push({ pathname: '/reschedule-appointment', params: { id: validId } } as any)}
                            >
                              <Text style={styles.outlinedButtonLabelTextContentString}>Reschedule</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                              style={styles.filledLightRedCancelActionButtonElement}
                              onPress={() => handleCancelAppointment(validId as string)}
                            >
                              <Text style={styles.filledCancelButtonLabelTextContentString}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                    )
                  ) : (
                    medicalRecordsList.length === 0 ? (
                      <Text style={styles.emptyStateDescriptionLabelText}>No retrospective medical logs discovered on account profile.</Text>
                    ) : (
                      medicalRecordsList.map((record) => (
                        <View key={record.id} style={styles.timelineClinicalLogCard}>
                          <Text style={styles.timelineDateTextHeadingLabel}>{formatDisplayDate(record.visit_date_time || record.visit_date)}</Text>
                          <Text style={styles.clinicalDiagnosisValueTextString}>{record.diagnosis}</Text>
                          {/* Timeline details... */}
                        </View>
                      ))
                    )
                  )}
                </View>
              </>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>

          {/* ── 5. FLOATING CIRCULAR SOS BUTTON ── */}
          <TouchableOpacity
            style={styles.floatingSosButton}
            onPress={() => setIsConfirmEmergencyModalVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.floatingSosButtonText}>SOS</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── EMERGENCY SOS CONFIRMATION MODAL ── */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isConfirmEmergencyModalVisible}
        onRequestClose={() => setIsConfirmEmergencyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle" size={56} color={colors.primary} />
              <Text style={styles.modalTitle}>Confirm Emergency SOS</Text>
            </View>
            <Text style={styles.modalBody}>
              Are you sure you want to trigger an Emergency SOS? This will request an ambulance immediately to your current location.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalButton}
                onPress={() => setIsConfirmEmergencyModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={() => {
                  setIsConfirmEmergencyModalVisible(false);
                  sendEmergencyRequest();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmModalButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── STYLESHEET ──
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: colors.headerBanner,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 65,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flex: 1 },
  greetingText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  userName: { color: colors.textPrimary, fontSize: 26, fontWeight: 'bold', marginTop: 3 },
  studentIdSubTitleText: { color: colors.textSecondary, fontSize: 13, marginTop: 4, fontWeight: '500' },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  bellWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCECE2',
  },
  avatarBadgeOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#3B6E5C',
    padding: 1.5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B5E4B',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  avatarBadgeInner: {
    width: 37,
    height: 37,
    borderRadius: 18.5,
    backgroundColor: '#1B5E4B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 37,
    height: 37,
    borderRadius: 18.5,
  },
  avatarInitialText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.badges.prescriptions.icon,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  scrollContent: { paddingBottom: 20 },
  statusOverlapCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  statusLeftRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  checkCircleGreenIconFrame: { marginRight: 10 },
  statusLabelsTextContainer: { flex: 1 },
  statusHeadlineMainTextText: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
  lastVisitStringMetaLabelText: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  nextAppointmentPillContainerPill: {
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    maxWidth: '45%',
  },
  pillHeadingTitleLabelText: { fontSize: 10, fontWeight: 'bold', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.3 },
  pillDateTimeStringValueText: { fontSize: 12, fontWeight: 'bold', color: colors.textPrimary, marginTop: 2 },
  amberWarningCallout: {
    backgroundColor: colors.warningBackground,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
  },
  warningHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  warningTitleText: { fontSize: 16, fontWeight: 'bold', color: colors.warningText, marginLeft: 8 },
  warningBodyText: { fontSize: 13, lineHeight: 20, color: colors.warningBody, fontWeight: '500' },
  gridSectionSection: { marginTop: 24, paddingHorizontal: 20 },
  sectionHeadingTitleMainLabel: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 14 },
  gridMatrixRowWrapper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  gridActionCardElement: {
    backgroundColor: colors.surface,
    width: '48%',
    borderRadius: 16,
    padding: 18,
    alignItems: 'flex-start',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  iconBackgroundCircleWrapperFrame: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  actionCardLabelContentString: { fontSize: 14, fontWeight: '600', color: colors.cardTitle, lineHeight: 18 },
  tabToggleRowBarContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: colors.softSurface,
    padding: 4,
    borderRadius: 14,
  },
  segmentTabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeSegmentTabButton: {
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  tabLabelStringText: { fontSize: 14, fontWeight: '600', color: colors.tabInactive },
  activeTabLabelStringText: { color: colors.primary, fontWeight: 'bold' },
  tabPanelBodyWrapper: { marginTop: 16, paddingHorizontal: 20 },
  emptyStateCardView: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyStateDescriptionLabelText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center' },
  emptyStateActionButtonCtaPill: {
    backgroundColor: colors.primary,
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  ctaButtonLabelText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  upcomingAppointmentCardWrapper: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  cardHeaderFlexLineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  doctorAvatarCircleWrapperFramePlaceholder: {
    width: 46,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.badges.records.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  doctorIdentityLabelsBlockText: { flex: 1 },
  doctorNameCardHeadlineText: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
  doctorSpecialtySubTextLabelText: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  appointmentTimeBadgeRowLinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  appointmentBadgeTimestampStringText: { fontSize: 13, fontWeight: 'bold', color: colors.primary },
  actionButtonSplitButtonContainerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  outlinedRescheduleActionButtonElement: {
    width: '48%',
    height: 45,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outlinedButtonLabelTextContentString: { color: colors.primary, fontSize: 14, fontWeight: 'bold' },
  filledLightRedCancelActionButtonElement: {
    width: '48%',
    height: 45,
    backgroundColor: colors.badges.prescriptions.background,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filledCancelButtonLabelTextContentString: { color: colors.badges.prescriptions.icon, fontSize: 14, fontWeight: 'bold' },
  floatingSosButton: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#C82829',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    elevation: 8,
    shadowColor: '#C82829',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  floatingSosButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },

  timelineClinicalLogCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  timelineDateTextHeadingLabel: { fontSize: 12, fontWeight: 'bold', color: colors.primary, textTransform: 'uppercase' },
  clinicalDiagnosisValueTextString: { fontSize: 17, fontWeight: 'bold', color: colors.textPrimary, marginTop: 4, marginBottom: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(22, 33, 28, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 10,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 28,
    alignItems: 'center',
  },
  cancelModalButtonText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  confirmModalButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 28,
    alignItems: 'center',
  },
  confirmModalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});