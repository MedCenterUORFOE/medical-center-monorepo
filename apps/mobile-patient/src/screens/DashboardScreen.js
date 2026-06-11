import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function DashboardScreen() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      // ── Replace this block with your real API call ──────────
      // const res = await fetch('https://your-api.com/user/profile', {
      //   headers: { Authorization: `Bearer ${token}` },
      // });
      // const data = await res.json();
      // setUserData(data);
      // ────────────────────────────────────────────────────────

      await new Promise(r => setTimeout(r, 1000));

      // Simulated backend — isRegistered: false  = new user
      setUserData({
        isRegistered: false,          // ← new user: no name, no activity shown
        name: 'Kasun Perera',         //   (hidden until registered)
        studentId: 'EG/2022/5431',
        faculty: 'Faculty of Engineering',
        notificationCount: 3,
        healthStatus: 'All Good',
        lastVisit: 'Feb 15',
        nextAppointment: { date: 'Mar 14', time: '10:30 AM' },
        recentActivity: [
          {
            id: '1',
            title: 'Prescription Renewed',
            desc: 'Paracetamol 500mg - 10 tablets',
            date: 'Feb 15',
            icon: 'pills',
          },
          {
            id: '2',
            title: 'Appointment Completed',
            desc: 'General Checkup with Dr. Perera',
            date: 'Feb 10',
            icon: 'calendar-check',
          },
        ],
      });
    } catch (err) {
      console.error('fetchUserData error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Derived display values ─────────────────────────────────
  const isRegistered  = userData?.isRegistered === true;
  const notifCount    = userData?.notificationCount ?? 0;
  const displayName   = isRegistered ? (userData?.name  ?? '') : '';
  const displayId     = isRegistered ? (userData?.studentId ?? '') : '';
  const displayFaculty = isRegistered ? (userData?.faculty ?? '') : '';
  const hasActivity   = isRegistered &&
    Array.isArray(userData?.recentActivity) &&
    userData.recentActivity.length > 0;

  const quickActions = [
    { id: 'apt',  label: 'Book Appointment',  icon: 'calendar-alt',            color: '#1D666A', route: '/book-appointment' },
    { id: 'rx',   label: 'My Prescriptions',  icon: 'prescription-bottle-alt', color: '#F59E0B', route: '/prescriptions'    },
    { id: 'rec',  label: 'Medical Records',   icon: 'folder-open',             color: '#1D666A', route: '/medical-records'  },
    { id: 'sos',  label: 'Emergency SOS',     icon: 'ambulance',               color: '#EF4444', route: '/emergency'        },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1D666A" />

      {/* ── Curved teal header (outside ScrollView so curve stays fixed) ── */}
      <View style={styles.header}>
        {isLoading ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <View style={styles.headerRow}>
            {/* Left: greeting + name */}
            <View style={styles.headerLeft}>
              <Text style={styles.greetingText}>{greeting}</Text>

              {/* Name only shown after registration */}
              {isRegistered ? (
                <Text style={styles.userName}>{displayName}</Text>
              ) : (
                <Text style={styles.userName}>{'Welcome!'}</Text>
              )}

              {/* Student ID only shown after registration */}
              {isRegistered ? (
                <Text style={styles.studentId}>
                  {displayId + ' - ' + displayFaculty}
                </Text>
              ) : null}
            </View>

            {/* Right: notification bell */}
            <TouchableOpacity
              style={styles.bellWrap}
              onPress={() => router.push('/notifications')}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications-outline" size={26} color="#fff" />
              {notifCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {notifCount > 9 ? '9+' : String(notifCount)}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Health card — floats over curve (registered only) ── */}
        {isRegistered && userData?.healthStatus ? (
          <View style={styles.healthCard}>
            <View style={styles.healthTop}>
              <MaterialIcons name="check-circle" size={40} color="#16A34A" />
              <View style={styles.healthTexts}>
                <Text style={styles.healthStatus}>{userData.healthStatus}</Text>
                <Text style={styles.lastVisit}>
                  {'Last visit: ' + (userData.lastVisit ?? '')}
                </Text>
              </View>
            </View>
            {userData.nextAppointment ? (
              <View style={styles.apptBanner}>
                <Text style={styles.apptLabel}>{'Next Appointment'}</Text>
                <Text style={styles.apptDate}>
                  {(userData.nextAppointment.date ?? '') +
                    ', ' +
                    (userData.nextAppointment.time ?? '')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Registration banner (new / unregistered users) ── */}
        {!isLoading && !isRegistered ? (
          <TouchableOpacity
            style={styles.warningBanner}
            onPress={() => router.push('/complete-profile')} // <--- UPDATED THIS LINE
            activeOpacity={0.8}
          >
            <MaterialIcons name="warning-amber" size={32} color="#E65100" />
            <View style={styles.warningTexts}>
              <Text style={styles.warningTitle}>{'Action Required'}</Text>
              <Text style={styles.warningSub}>
                {'Complete your registration process'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#E65100" />
          </TouchableOpacity>
        ) : null}

        {/* ── Quick Actions (shown to all users) ── */}
        {!isLoading ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{'Quick Actions'}</Text>
            <View style={styles.grid}>
              {quickActions.map(a => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.actionCard}
                  onPress={() => router.push(a.route)}
                  activeOpacity={0.75}
                >
                  <FontAwesome5 name={a.icon} size={28} color={a.color} />
                  <Text style={styles.actionLabel}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Recent Activity (registered users with data only) ── */}
        {hasActivity ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{'Recent Activity'}</Text>
            {userData.recentActivity.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.activityRow}
                activeOpacity={0.75}
              >
                <View style={styles.activityIconWrap}>
                  <FontAwesome5 name={item.icon} size={18} color="#1D666A" />
                </View>
                <View style={styles.activityTexts}>
                  <Text style={styles.activityTitle}>{item.title}</Text>
                  <Text style={styles.activityDesc}>{item.desc}</Text>
                </View>
                <Text style={styles.activityDate}>{item.date}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E8ECEC',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    backgroundColor: '#1D666A',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 50,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    zIndex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { flex: 1 },
  greetingText: { color: 'rgba(255,255,255,0.75)', fontSize: 14 },
  userName: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginTop: 2 },
  studentId: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 },

  // ── Bell ──────────────────────────────────────────────────
  bellWrap: { position: 'relative', padding: 4, marginTop: 4 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#1D666A',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  // ── Scroll ────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  // ── Health Card ───────────────────────────────────────────
  healthCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: -28,
    borderRadius: 20,
    padding: 18,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    zIndex: 2,
  },
  healthTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  healthTexts: { marginLeft: 12 },
  healthStatus: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  lastVisit: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  apptBanner: {
    backgroundColor: '#CEEAEA',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  apptLabel: { fontSize: 13, color: '#1D666A', fontWeight: '600' },
  apptDate: { fontSize: 15, color: '#1D666A', fontWeight: 'bold', marginTop: 2 },

  // ── Warning Banner ────────────────────────────────────────
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  warningTexts: { flex: 1, paddingHorizontal: 12 },
  warningTitle: { color: '#E65100', fontSize: 12, fontWeight: 'bold' },
  warningSub: { color: '#E65100', fontSize: 13, fontWeight: '600', marginTop: 2 },

  // ── Section ───────────────────────────────────────────────
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 14 },

  // ── Quick Actions Grid ────────────────────────────────────
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'flex-start',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  actionLabel: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    lineHeight: 20,
  },

  // ── Activity ──────────────────────────────────────────────
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  activityIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E6F4F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityTexts: { flex: 1, paddingHorizontal: 12 },
  activityTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  activityDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  activityDate: { fontSize: 11, color: '#9CA3AF' },

  bottomPad: { height: 32 },
});