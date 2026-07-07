import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LandingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <View style={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Driver App</Text>
          </View>

          <Text style={styles.title}>Medical Center Driver Portal</Text>
          <Text style={styles.subtitle}>
            Accept assignments, review pickup details, and keep trips moving from one clean home screen.
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
            Sign in to view today's route list and your current transport requests.
          </Text>

          <Pressable style={styles.primaryButton} onPress={() => router.push('/login')}>
            <Text style={styles.primaryButtonText}>Log In</Text>
          </Pressable>

          <View style={styles.footerRow}>
            <View style={styles.footerDot} />
            <Text style={styles.footerText}>Built for drivers, tuned for quick access</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#071821',
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
    backgroundColor: 'rgba(33, 211, 173, 0.22)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -130,
    left: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(14, 116, 144, 0.2)',
  },
  heroCard: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 18,
  },
  badgeText: {
    color: '#BFF9E6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    maxWidth: 320,
  },
  subtitle: {
    color: 'rgba(226, 232, 240, 0.78)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 18,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  statLabel: {
    color: 'rgba(226, 232, 240, 0.72)',
    fontSize: 13,
    lineHeight: 18,
  },
  actionCard: {
    borderRadius: 32,
    backgroundColor: '#F8FAFC',
    padding: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  actionTitle: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '800',
  },
  actionCopy: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: '#0F766E',
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
    backgroundColor: '#0F766E',
  },
  footerText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
});