import React, { useEffect, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	FlatList,
	RefreshControl,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type MedicalRecordApiItem = {
	id?: string | number;
	record_id?: string | number;
	report_type?: string | null;
	type?: string | null;
	date?: string | null;
	upload_time?: string | null;
	visit_date?: string | null;
	created_at?: string | null;
	doctor_name?: string | null;
	doctor?: {
		name?: string | null;
		staff?: {
			user?: {
				name?: string | null;
			} | null;
		} | null;
	} | null;
	status?: string | null;
};

type MedicalRecordCard = {
	id: string;
	reportType: string;
	dateLabel: string;
	doctorName: string;
	status: 'Completed' | 'Pending';
};

const formatDate = (value?: string | null): string => {
	if (!value) return 'Date unavailable';

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;

	return parsed.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
};

const normalizeStatus = (value?: string | null): 'Completed' | 'Pending' => {
	if (!value) return 'Pending';

	const normalized = value.trim().toLowerCase();
	if (normalized === 'completed' || normalized === 'done') return 'Completed';

	return 'Pending';
};

const normalizeMedicalRecords = (payload: any): MedicalRecordCard[] => {
	const dossier = payload?.data?.patient || payload?.patient || payload?.data || payload;
	const rawItems: MedicalRecordApiItem[] =
		dossier?.medical_records ||
		dossier?.medicalRecords ||
		dossier?.records ||
		dossier?.reports ||
		payload?.data?.history ||
		payload?.history ||
		payload?.data?.medical_records ||
		payload?.data?.records ||
		payload?.data?.reports ||
		payload?.medical_records ||
		payload?.records ||
		payload?.reports ||
		payload?.data ||
		[];

	if (!Array.isArray(rawItems)) {
		return [];
	}

	return rawItems.map((item, index) => ({
		id: String(item.id || item.record_id || `record-${index}`),
		reportType: item.report_type || item.type || 'Medical Report',
		dateLabel: formatDate(item.date || item.upload_time || item.visit_date || item.created_at),
		doctorName:
			item.doctor_name ||
			item.doctor?.staff?.user?.name ||
			item.doctor?.name ||
			'Assigned Doctor',
		status: normalizeStatus(item.status),
	}));
};

export default function MedicalRecordsScreen() {
	const [records, setRecords] = useState<MedicalRecordCard[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		void loadMedicalRecords();
	}, []);

	const loadMedicalRecords = async () => {
		setIsLoading(true);
		setErrorMessage(null);

		try {
			const apiUrl = process.env.EXPO_PUBLIC_API_URL;
			if (!apiUrl) {
				throw new Error('API URL is not configured.');
			}

			const token = await AsyncStorage.getItem('userToken');
			const userId = await AsyncStorage.getItem('userId');
			if (!token) {
				console.warn('Missing userToken in AsyncStorage while loading medical records.');
				throw new Error('You are not logged in. Please sign in again.');
			}
			if (!userId) {
				throw new Error('Unable to identify the current patient account.');
			}

			console.log('Attempting to fetch from:', apiUrl);

			const response = await fetch(`${apiUrl}/api/records/history/${userId}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				const textData = await response.text();
				console.error('HTTP Error Status:', response.status, 'Body:', textData);
				setErrorMessage(`HTTP ${response.status}: ${textData || 'No response body returned.'}`);
				setRecords([]);
				return;
			}

			const payload = await response.json().catch(() => ({}));
			setRecords(normalizeMedicalRecords(payload));
		} catch (error) {
			console.error('Raw Fetch Error:', error);
			const message = error instanceof Error ? error.message : String(error);
			setErrorMessage(message);
			setRecords([]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleViewPdf = () => {
		Alert.alert('Downloading Report...');
	};

	const renderRecordCard = ({ item }: { item: MedicalRecordCard }) => {
		const isCompleted = item.status === 'Completed';

		return (
			<View style={styles.card}>
				<View style={styles.cardHeader}>
					<View style={styles.iconBubble}>
						<Ionicons name="document-text-outline" size={21} color="#1D4ED8" />
					</View>

					<View style={styles.headerTextWrap}>
						<Text style={styles.cardTitle}>{item.reportType}</Text>
						<Text style={styles.cardDate}>{item.dateLabel}</Text>
					</View>

					<View style={[styles.statusBadge, isCompleted ? styles.statusCompleted : styles.statusPending]}>
						<Text style={[styles.statusText, isCompleted ? styles.statusTextCompleted : styles.statusTextPending]}>
							{item.status}
						</Text>
					</View>
				</View>

				<View style={styles.sectionBlock}>
					<Text style={styles.sectionLabel}>Recommending Doctor</Text>
					<Text style={styles.sectionValue}>{item.doctorName}</Text>
				</View>

				{isCompleted ? (
					<TouchableOpacity style={styles.downloadButton} onPress={handleViewPdf} activeOpacity={0.85}>
						<Ionicons name="download-outline" size={18} color="#FFFFFF" />
						<Text style={styles.downloadButtonText}>View / Download PDF</Text>
					</TouchableOpacity>
				) : (
					<View style={styles.pendingNote}>
						<Ionicons name="time-outline" size={16} color="#64748B" />
						<Text style={styles.pendingNoteText}>PDF will be available once this report is completed.</Text>
					</View>
				)}
			</View>
		);
	};

	const renderEmptyState = () => {
		if (errorMessage) return null;

		return (
			<View style={styles.stateCard}>
				<View style={styles.stateIconBubble}>
					<Ionicons name="search-outline" size={28} color="#1D4ED8" />
				</View>
				<Text style={styles.stateTitle}>No medical records found</Text>
				<Text style={styles.stateBody}>
					No records were returned from your backend for this patient account.
				</Text>
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
			<StatusBar barStyle="dark-content" backgroundColor="#EAF1F8" />

			<View style={styles.header}>
				<View style={styles.badge}>
					<Ionicons name="medical-outline" size={16} color="#1D4ED8" />
					<Text style={styles.badgeText}>Patient Records</Text>
				</View>
				<Text style={styles.title}>Medical Records</Text>
				<Text style={styles.subtitle}>
					Review reports, scans, and diagnostic results from your care team in one place.
				</Text>
			</View>

			<View style={styles.surface}>
				{isLoading ? (
					<View style={styles.loadingWrap}>
						<ActivityIndicator size="large" color="#1D4ED8" />
						<Text style={styles.loadingText}>Loading medical records...</Text>
					</View>
				) : errorMessage ? (
					<View style={styles.stateCard}>
						<View style={[styles.stateIconBubble, styles.errorIconBubble]}>
							<Ionicons name="alert-circle-outline" size={28} color="#DC2626" />
						</View>
						<Text style={styles.stateTitle}>Backend Connection Failed</Text>
						<Text style={styles.stateBody}>{errorMessage}</Text>
						<TouchableOpacity style={styles.retryButton} onPress={loadMedicalRecords} activeOpacity={0.85}>
							<Text style={styles.retryButtonText}>Try Again</Text>
						</TouchableOpacity>
					</View>
				) : (
					<FlatList
						data={records}
						keyExtractor={(item) => item.id}
						renderItem={renderRecordCard}
						contentContainerStyle={styles.listContent}
						showsVerticalScrollIndicator={false}
						ListEmptyComponent={renderEmptyState}
						refreshControl={
							<RefreshControl refreshing={false} onRefresh={loadMedicalRecords} tintColor="#1D4ED8" />
						}
					/>
				)}
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: '#EAF1F8',
	},
	header: {
		paddingHorizontal: 20,
		paddingTop: 16,
		paddingBottom: 20,
		backgroundColor: '#EAF1F8',
	},
	badge: {
		alignSelf: 'flex-start',
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: '#FFFFFF',
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 8,
		marginBottom: 14,
		borderWidth: 1,
		borderColor: '#D7E3F0',
	},
	badgeText: {
		color: '#1E3A8A',
		fontSize: 12,
		fontWeight: '700',
		letterSpacing: 0.4,
	},
	title: {
		color: '#0F172A',
		fontSize: 30,
		lineHeight: 36,
		fontWeight: '800',
		letterSpacing: -0.5,
		marginBottom: 8,
	},
	subtitle: {
		color: '#475569',
		fontSize: 15,
		lineHeight: 22,
	},
	surface: {
		flex: 1,
		backgroundColor: '#F7FAFD',
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		paddingTop: 18,
	},
	loadingWrap: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		gap: 12,
		paddingHorizontal: 24,
	},
	loadingText: {
		color: '#1E3A8A',
		fontSize: 15,
		fontWeight: '600',
	},
	listContent: {
		paddingHorizontal: 20,
		paddingBottom: 28,
	},
	card: {
		backgroundColor: '#FFFFFF',
		borderRadius: 22,
		padding: 18,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: '#E2E8F0',
		shadowColor: '#0F172A',
		shadowOpacity: 0.08,
		shadowRadius: 16,
		shadowOffset: { width: 0, height: 8 },
		elevation: 3,
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 12,
		marginBottom: 16,
	},
	iconBubble: {
		width: 44,
		height: 44,
		borderRadius: 16,
		backgroundColor: '#E8F0FE',
		alignItems: 'center',
		justifyContent: 'center',
	},
	headerTextWrap: {
		flex: 1,
	},
	cardTitle: {
		color: '#0F172A',
		fontSize: 17,
		fontWeight: '700',
		marginBottom: 4,
	},
	cardDate: {
		color: '#64748B',
		fontSize: 13,
		fontWeight: '500',
	},
	statusBadge: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderWidth: 1,
	},
	statusCompleted: {
		backgroundColor: '#DCFCE7',
		borderColor: '#86EFAC',
	},
	statusPending: {
		backgroundColor: '#FEF3C7',
		borderColor: '#FCD34D',
	},
	statusText: {
		fontSize: 12,
		fontWeight: '800',
		letterSpacing: 0.3,
		textTransform: 'uppercase',
	},
	statusTextCompleted: {
		color: '#166534',
	},
	statusTextPending: {
		color: '#92400E',
	},
	sectionBlock: {
		marginBottom: 14,
	},
	sectionLabel: {
		color: '#334155',
		fontSize: 12,
		fontWeight: '800',
		letterSpacing: 0.7,
		textTransform: 'uppercase',
		marginBottom: 7,
	},
	sectionValue: {
		color: '#0F172A',
		fontSize: 15,
		lineHeight: 22,
	},
	downloadButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		backgroundColor: '#1D4ED8',
		borderRadius: 14,
		paddingVertical: 13,
		paddingHorizontal: 16,
	},
	downloadButtonText: {
		color: '#FFFFFF',
		fontSize: 14,
		fontWeight: '700',
	},
	pendingNote: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingVertical: 2,
	},
	pendingNoteText: {
		flex: 1,
		color: '#64748B',
		fontSize: 13,
		lineHeight: 18,
	},
	stateCard: {
		backgroundColor: '#FFFFFF',
		borderRadius: 22,
		padding: 24,
		marginHorizontal: 20,
		marginTop: 24,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#E2E8F0',
		shadowColor: '#0F172A',
		shadowOpacity: 0.08,
		shadowRadius: 16,
		shadowOffset: { width: 0, height: 8 },
		elevation: 3,
	},
	stateIconBubble: {
		width: 56,
		height: 56,
		borderRadius: 18,
		backgroundColor: '#E8F0FE',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 14,
	},
	errorIconBubble: {
		backgroundColor: '#FEE2E2',
	},
	stateTitle: {
		color: '#0F172A',
		fontSize: 18,
		fontWeight: '800',
		textAlign: 'center',
		marginBottom: 8,
	},
	stateBody: {
		color: '#64748B',
		fontSize: 14,
		lineHeight: 21,
		textAlign: 'center',
	},
	retryButton: {
		marginTop: 16,
		backgroundColor: '#1D4ED8',
		borderRadius: 14,
		paddingHorizontal: 18,
		paddingVertical: 12,
	},
	retryButtonText: {
		color: '#FFFFFF',
		fontSize: 14,
		fontWeight: '700',
	},
});
