import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSessionToken } from '../lib/api';

export default function LandingScreen() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    getSessionToken()
      .then((token) => {
        if (token && active) {
          router.replace('/home');
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <View style={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}> Ambulance Driver App</Text>
          </View>

          <Text style={styles.title}>Medical Center Driver Portal</Text>
          <Text style={styles.subtitle}>
            Accept assignments and review emergency pickups.
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>24/7</Text>
              <Text style={styles.statLabel}>Dispatch access</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>Fast</Text>
              <Text style={styles.statLabel}>Trip updates</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>Start your shift</Text>
          <Text style={styles.actionCopy}>
            Sign in to view today's transport requests.
          </Text>

          <Pressable style={styles.primaryButton} onPress={() => router.push('/login')}>
            <Text style={styles.primaryButtonText}>Log In</Text>
          </Pressable>

          <View style={styles.footerRow}>
            <View style={styles.footerDot} />
            <Text style={styles.footerText}>Built for drivers</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2FAF6',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    justifyContent: 'space-between',
    gap: 20,
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(111, 190, 155, 0.2)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -130,
    left: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(185, 222, 203, 0.42)',
  },
  heroCard: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#DDEFE6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 18,
  },
  badgeText: {
    color: '#2F8F72',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    maxWidth: 320,
  },
  subtitle: {
    color: '#527067',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14,
    maxWidth: 340,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  statCard: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#E8F3ED',
    borderWidth: 1,
    borderColor: '#D2E8DC',
    padding: 18,
  },
  statValue: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  statLabel: {
    color: '#66847A',
    fontSize: 13,
    lineHeight: 18,
  },
  actionCard: {
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    padding: 22,
    shadowColor: '#7FAF98',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  actionTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
  },
  actionCopy: {
    color: '#527067',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: '#2F8F72',
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2F8F72',
  },
  footerText: {
    color: '#66847A',
    fontSize: 12,
    fontWeight: '500',
  },
});