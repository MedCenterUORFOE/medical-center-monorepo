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
  Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; 
import { Ionicons, MaterialIcons, FontAwesome5, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

// ── TypeScript Data Interfaces ──
interface ProfileSchema {
  full_name: string;
  student_id: string;
  faculty: string;
  avatar_url?: string | null;
  is_profile_complete: boolean; 
}

// ✅ අලුත් Database Field නම් වලට ගැළපෙන්න වෙනස් කළා
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
  visit_date: string;
  diagnosis: string;
  symptoms?: string | null;
  treatment_plan?: string | null;
  prescription_notes?: string | null;
  follow_up_date?: string | null;
}

export default function PatientDashboard() {
  const router = useRouter();
  
  const [profile, setProfile] = useState<ProfileSchema | null>(null);
  const [hasVerifiedProfile, setHasVerifiedProfile] = useState<boolean>(true);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [appointmentsList, setAppointmentsList] = useState<AppointmentSchema[]>([]);
  const [nextAppointment, setNextAppointment] = useState<AppointmentSchema | null>(null);
  const [medicalRecordsList, setMedicalRecordsList] = useState<MedicalRecordSchema[]>([]);
  
  const [activeTab, setActiveTab] = useState<'CONSULTATIONS' | 'TIMELINE'>('CONSULTATIONS');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [greeting, setGreeting] = useState<string>('');

  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    configureClockGreeting();
    fetchDashboardDataFromBackend();
  }, []);

  const configureClockGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  };

  // ── FETCH DATA FROM NEXT.JS BACKEND API ──
  const fetchDashboardDataFromBackend = async () => {
    setIsLoading(true);
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const patientId = await AsyncStorage.getItem('userId');
      const token = await AsyncStorage.getItem('userToken'); 
      
      if (!patientId || !token) {
        setIsLoading(false);
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      };

      // 1. Fetch Profile Data
      const profileRes = await fetch(`${API_URL}/api/profiles/${patientId}`, { headers });
      if (profileRes.ok) {
        const rawResponse = await profileRes.json();
        const patientData = rawResponse.data?.patient;

        if (patientData) {
          setProfile({
            full_name: patientData.student?.full_name || patientData.student?.name || patientData.name || 'Student',
            student_id: patientData.student?.university_reg_number || '',
            faculty: patientData.student?.faculty || '',
            is_profile_complete: !!patientData.student 
          });
          setHasVerifiedProfile(!!patientData.student);
        } else {
           setHasVerifiedProfile(false);
        }
      }

      // 2. Fetch Appointments (✅ හරියටම දත්ත කියවන විදිහ හැදුවා)
      // සෘජුවම /api/appointments එකෙන් අරගෙන ඒකෙන් Scheduled ඒවා විතරක් පෙරාගමු
      const aptRes = await fetch(`${API_URL}/api/appointments`, { headers });
      if (aptRes.ok) {
        const rawAptData = await aptRes.json();
        const aptList = rawAptData.data || rawAptData.appointments || rawAptData || [];
        
        if (Array.isArray(aptList)) {
          // 'SCHEDULED' තත්ත්වයේ තියෙන ඒවා විතරක් ගන්නවා
          const upcoming = aptList.filter(apt => apt.status === 'SCHEDULED' || apt.status === 'confirmed');
          
          // ළඟම තියෙන දිනයට අනුව පිළිවෙළට හදනවා (Sort by date)
          upcoming.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());
          
          setAppointmentsList(upcoming);
          if (upcoming.length > 0) {
            setNextAppointment(upcoming[0]);
          }
        }
      }

      // 3. Fetch Medical History
      const historyRes = await fetch(`${API_URL}/api/records/history?userId=${patientId}`, { headers });
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setMedicalRecordsList(historyData.data || historyData || []);
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  

  
  const handleCancelAppointment = async (appointmentId: string) => {
    Alert.alert('Confirm Cancellation', 'Are you sure you want to cancel this appointment?', [
      { text: 'No', style: 'cancel' },
      { 
        text: 'Yes, Cancel', 
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);
          try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            const token = await AsyncStorage.getItem('userToken');
            
            // ✅ Status එක Update කරන ඔයාගේ Route එකට කතා කරනවා
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
            setIsLoading(false);
          }
        }
      }
    ]);
  };

  

  // --- Panic Button Logic --- (නොවෙනස්ව)
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

  const executePanicBackendRequest = async () => {
    // ... [Emergency logic remains exactly the same]
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
      <StatusBar barStyle="light-content" backgroundColor="#1B5E55" />

      {/* ── 1. DYNAMIC HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingText}>{greeting},</Text>
            <Text style={styles.userName}>{profile?.full_name || 'Loading...'}</Text>
            {hasVerifiedProfile && profile?.student_id && (
              <Text style={styles.studentIdSubTitleText}>
                {profile.student_id}  •  {profile.faculty}
              </Text>
            )}
          </View>

          <TouchableOpacity style={styles.bellWrap} onPress={() => router.push('/notifications' as any)} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={26} color="#FFFFFF" />
            {unreadNotifCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#1B5E55" />
        </View>
      ) : (
        <View style={{ flex: 1, zIndex: 10, elevation: 10, marginTop: hasVerifiedProfile ? -40 : 0 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

            {/* ── 2. DYNAMIC HEALTH STATUS CARD ── */}
            {hasVerifiedProfile && (
              <View style={styles.statusOverlapCard}>
                <View style={styles.statusLeftRow}>
                  <View style={styles.checkCircleGreenIconFrame}>
                    <Ionicons name="fitness-outline" size={32} color="#16A34A" />
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
                    <Text style={{fontSize: 10, color: '#1B5E55', fontWeight: 'bold'}}>{formatDisplayTime(nextAppointment.scheduled_time)}</Text>
                  )}
                </View>
              </View>
            )}

            {/* ── UNVERIFIED PROFILE BANNER ── */}
            {!hasVerifiedProfile && (
              <TouchableOpacity style={styles.amberWarningCallout} onPress={() => router.push('/complete-profile' as any)}>
                <View style={styles.warningHeaderRow}>
                  <MaterialIcons name="warning" size={24} color="#D97706" />
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
                <TouchableOpacity style={styles.gridActionCardElement} onPress={() => router.push('/book-appointment' as any)}>
                  <View style={[styles.iconBackgroundCircleWrapperFrame, { backgroundColor: '#E0F2FE' }]}>
                    <Feather name="calendar" size={22} color="#0284C7" />
                  </View>
                  <Text style={styles.actionCardLabelContentString}>Book Appointment</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.gridActionCardElement} onPress={() => router.push('/prescriptions' as any)}>
                  <View style={[styles.iconBackgroundCircleWrapperFrame, { backgroundColor: '#FDE8E8' }]}>
                    <FontAwesome5 name="pills" size={20} color="#DC2626" />
                  </View>
                  <Text style={styles.actionCardLabelContentString}>My Prescriptions</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.gridMatrixRowWrapper}>
                <TouchableOpacity style={styles.gridActionCardElement} onPress={() => router.push('/medical-records' as any)}>
                  <View style={[styles.iconBackgroundCircleWrapperFrame, { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons name="document-text-outline" size={22} color="#16A34A" />
                  </View>
                  <Text style={styles.actionCardLabelContentString}>Medical Records</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.gridActionCardElement} onPress={() => router.push('/emergency' as any)}>
                  <View style={[styles.iconBackgroundCircleWrapperFrame, { backgroundColor: '#FEE2E2' }]}>
                    <MaterialIcons name="add-alert" size={24} color="#EF4444" />
                  </View>
                  <Text style={styles.actionCardLabelContentString}>Emergency SOS</Text>
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
                      Consultations ({appointmentsList.length})
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
                    appointmentsList.length === 0 ? (
                      <View style={styles.emptyStateCardView}>
                        <Text style={styles.emptyStateDescriptionLabelText}>No upcoming consultations booked.</Text>
                        <TouchableOpacity style={styles.emptyStateActionButtonCtaPill} onPress={() => router.push('/book-appointment' as any)}>
                          <Text style={styles.ctaButtonLabelText}>Book one now</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      appointmentsList.map((item) => {
                      // 🚀 මෙන්න සුපිරිම වැඩේ: Backend එකෙන් එන නම මොකක් වුණත් අපි ඒක හරියටම ගන්නවා!
                      const validId = item.id || item.appointment_id;

                      return (
                        <View key={validId} style={styles.upcomingAppointmentCardWrapper}>
                          <View style={styles.cardHeaderFlexLineRow}>
                            <View style={styles.doctorAvatarCircleWrapperFramePlaceholder}>
                              <FontAwesome5 name="user-md" size={22} color="#1B5E55" />
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
                            <Ionicons name="time-outline" size={16} color="#1B5E55" style={{ marginRight: 6 }} />
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
                          <Text style={styles.timelineDateTextHeadingLabel}>{formatDisplayDate(record.visit_date)}</Text>
                          <Text style={styles.clinicalDiagnosisValueTextString}>{record.diagnosis}</Text>
                          {/* Timeline details... */}
                        </View>
                      ))
                    )
                  )}
                </View>
              </>
            )}

            <View style={{ height: 120 }} />
          </ScrollView>

          {/* ── 5. GLOBAL PANIC EMERGENCY FOOTER ── */}
          <View style={styles.emergencyBottomNavigationFixedLayerContainerBar}>
            <View style={styles.progressRingOuterContainerBackgroundBox}>
              <Animated.View style={[styles.progressRingInflationLiquidBar, { width: progressWidth }]} />
            </View>
            <Animated.View style={{ transform: [{ scale: scaleAnim }], width: '100%' }}>
              <TouchableOpacity
                style={styles.massivePanicRedButtonCircleElement}
                onPressIn={handleEmergencyPressIn}
                onPressOut={handleEmergencyPressOut}
                activeOpacity={0.9}
              >
                <FontAwesome5 name="ambulance" size={18} color="#FFFFFF" style={{ marginBottom: 4 }} />
                <Text style={styles.panicButtonLabelTextContent}>TRIGGER EMERGENCY</Text>
                <Text style={styles.panicButtonHoldLabelInstructionsSubText}>Hold for 3 seconds to confirm</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── STYLESHEET ──
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#E8ECEC' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#1B5E55', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 65, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flex: 1 },
  greetingText: { color: 'rgba(255,255,255,0.78)', fontSize: 14, fontWeight: '500' },
  userName: { color: '#FFFFFF', fontSize: 26, fontWeight: 'bold', marginTop: 3 },
  studentIdSubTitleText: { color: 'rgba(255,255,255,0.72)', fontSize: 13, marginTop: 4, fontWeight: '500' },
  bellWrap: { padding: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12 },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#1B5E55' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  scrollContent: { paddingBottom: 20 },
  statusOverlapCard: { backgroundColor: '#FFFFFF', borderRadius: 20, marginHorizontal: 20, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
  statusLeftRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  checkCircleGreenIconFrame: { marginRight: 10 },
  statusLabelsTextContainer: { flex: 1 },
  statusHeadlineMainTextText: { fontSize: 16, fontWeight: 'bold', color: '#111111' },
  lastVisitStringMetaLabelText: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '500' },
  nextAppointmentPillContainerPill: { backgroundColor: '#E6F4F4', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'flex-end', maxWidth: '45%' },
  pillHeadingTitleLabelText: { fontSize: 10, fontWeight: 'bold', color: '#1B5E55', textTransform: 'uppercase', letterSpacing: 0.3 },
  pillDateTimeStringValueText: { fontSize: 12, fontWeight: 'bold', color: '#1B5E55', marginTop: 2 },
  amberWarningCallout: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 20, marginHorizontal: 20, marginTop: 20, padding: 16 },
  warningHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  warningTitleText: { fontSize: 16, fontWeight: 'bold', color: '#92400E', marginLeft: 8 },
  warningBodyText: { fontSize: 13, lineHeight: 20, color: '#B45309', fontWeight: '500' },
  gridSectionSection: { marginTop: 24, paddingHorizontal: 20 },
  sectionHeadingTitleMainLabel: { fontSize: 18, fontWeight: 'bold', color: '#111111', marginBottom: 14 },
  gridMatrixRowWrapper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  gridActionCardElement: { backgroundColor: '#FFFFFF', width: '48%', borderRadius: 18, padding: 18, alignItems: 'flex-start', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4 },
  iconBackgroundCircleWrapperFrame: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  actionCardLabelContentString: { fontSize: 14, fontWeight: 'bold', color: '#111111', lineHeight: 18 },
  tabToggleRowBarContainer: { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, backgroundColor: '#E4EAEA', padding: 4, borderRadius: 14 },
  segmentTabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeSegmentTabButton: { backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  tabLabelStringText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  activeTabLabelStringText: { color: '#1B5E55', fontWeight: 'bold' },
  tabPanelBodyWrapper: { marginTop: 16, paddingHorizontal: 20 },
  emptyStateCardView: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  emptyStateDescriptionLabelText: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', textAlign: 'center' },
  emptyStateActionButtonCtaPill: { backgroundColor: '#1B5E55', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, marginTop: 14 },
  ctaButtonLabelText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  upcomingAppointmentCardWrapper: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, elevation: 2 },
  cardHeaderFlexLineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  doctorAvatarCircleWrapperFramePlaceholder: { width: 46, height: 44, borderRadius: 22, backgroundColor: '#E6F4F4', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  doctorIdentityLabelsBlockText: { flex: 1 },
  doctorNameCardHeadlineText: { fontSize: 16, fontWeight: 'bold', color: '#111111' },
  doctorSpecialtySubTextLabelText: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  appointmentTimeBadgeRowLinePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E6F4F4', alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginBottom: 16 },
  appointmentBadgeTimestampStringText: { fontSize: 13, fontWeight: 'bold', color: '#1B5E55' },
  actionButtonSplitButtonContainerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  outlinedRescheduleActionButtonElement: { width: '48%', height: 45, borderWidth: 1.5, borderColor: '#1B5E55', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  outlinedButtonLabelTextContentString: { color: '#1B5E55', fontSize: 14, fontWeight: 'bold' },
  filledLightRedCancelActionButtonElement: { width: '48%', height: 45, backgroundColor: '#FEE2E2', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  filledCancelButtonLabelTextContentString: { color: '#DC2626', fontSize: 14, fontWeight: 'bold' },
  emergencyBottomNavigationFixedLayerContainerBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 10, alignItems: 'center' },
  progressRingOuterContainerBackgroundBox: { width: '100%', height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, marginBottom: 12, overflow: 'hidden' },
  progressRingInflationLiquidBar: { height: '100%', backgroundColor: '#EF4444' },
  massivePanicRedButtonCircleElement: { width: '100%', backgroundColor: '#DC2626', borderRadius: 16, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  panicButtonLabelTextContent: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  panicButtonHoldLabelInstructionsSubText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  
  timelineClinicalLogCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#1B5E55', elevation: 2 },
  timelineDateTextHeadingLabel: { fontSize: 12, fontWeight: 'bold', color: '#1B5E55', textTransform: 'uppercase' },
  clinicalDiagnosisValueTextString: { fontSize: 17, fontWeight: 'bold', color: '#111111', marginTop: 4, marginBottom: 8 },
});