import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Ionicons,
  MaterialCommunityIcons,
  Feather,
  FontAwesome5,
} from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors } from '../theme/colors';
import { useAppSettings } from '../context/AppSettingsContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const HEIGHT_PRESETS = [150, 155, 160, 165, 170, 175, 180, 185];
const WEIGHT_PRESETS = [45, 50, 55, 60, 65, 70, 75, 80, 85];
const RELATIONSHIP_OPTIONS = ['Father', 'Mother', 'Guardian', 'Sibling', 'Spouse', 'Other'];

// ── Types & Interfaces ──
export interface StudentData {
  student_id: string;
  university_reg_number: string;
  university_email: string | null;
  faculty: string;
  department: string | null;
  year_of_study: number;
  batch: string;
  emergency_contact_name: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_number: string | null;
}

export interface AcademicStaffData {
  academic_staff_id: string;
  university_staff_id: string;
  university_email: string | null;
  department: string;
  position: string;
  emergency_contact_name: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_number: string | null;
}

export interface ClinicalProfileData {
  user_id: string;
  blood_group: string | null;
  allergies: string | null;
  special_notes: string | null;
  height: number | null;
  weight: number | null;
  date_of_birth: string | null;
}

export interface PatientData {
  id: string;
  name: string;
  surname?: string;
  email: string;
  username: string | null;
  nic: string | null;
  phone: string | null;
  role: string;
  profile_picture: string | null;
  student: StudentData | null;
  academicStaff: AcademicStaffData | null;
  patientProfile: ClinicalProfileData | null;
}

interface LocalProfileOverrides {
  name?: string;
  surname?: string;
  phone?: string;
  blood_group?: string | null;
  allergies?: string | null;
  special_notes?: string | null;
  height?: number | null;
  weight?: number | null;
  date_of_birth?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_number?: string | null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { logout } = useAppSettings();

  // ScrollView Ref for auto-scrolling to bottom fields when focused
  const scrollViewRef = useRef<ScrollView>(null);

  // ── Auth Credentials State ──
  const [patientId, setPatientId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // ── Local Overrides & Caching ──
  const [cachedOverrides, setCachedOverrides] = useState<LocalProfileOverrides | null>(null);
  const [cachedUserData, setCachedUserData] = useState<any>(null);
  const [cachedPatientProfile, setCachedPatientProfile] = useState<any>(null);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [avatarImageError, setAvatarImageError] = useState<boolean>(false);
  const [isAvatarReset, setIsAvatarReset] = useState<boolean>(false);

  // ── UI Modal & Loading States ──
  const [isPhotoSheetVisible, setIsPhotoSheetVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Keyboard Avoidance Dynamic Height ──
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 260);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Edit Modal Form States ──
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editBloodGroup, setEditBloodGroup] = useState<string | null>(null);
  const [editHeight, setEditHeight] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editAllergies, setEditAllergies] = useState('');
  const [editSpecialNotes, setEditSpecialNotes] = useState('');
  const [editGuardianName, setEditGuardianName] = useState('');
  const [editGuardianRelation, setEditGuardianRelation] = useState('Father');
  const [editGuardianPhone, setEditGuardianPhone] = useState('');

  // ── Date Picker Modal States ──
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(2002);
  const [pickerMonth, setPickerMonth] = useState<number>(11); // 0-indexed (11 = Dec)
  const [pickerDay, setPickerDay] = useState<number>(23);
  const [isYearPickerMode, setIsYearPickerMode] = useState<boolean>(false);

  // ── Initialize Credentials and Local Overrides Cache ──
  const loadAuthAndCache = useCallback(async () => {
    try {
      const id = (await SecureStore.getItemAsync('userId')) || (await AsyncStorage.getItem('userId'));
      const token = (await SecureStore.getItemAsync('userToken')) || (await AsyncStorage.getItem('userToken'));
      setPatientId(id);
      setAuthToken(token);

      if (id) {
        const [overridesRaw, avatarRaw, userDataRaw, patientProfileRaw, avatarResetRaw] = await Promise.all([
          AsyncStorage.getItem(`patient_profile_overrides_${id}`),
          AsyncStorage.getItem(`patient_avatar_${id}`),
          AsyncStorage.getItem('userData'),
          AsyncStorage.getItem(`patientProfile_${id}`),
          AsyncStorage.getItem(`patient_avatar_reset_${id}`),
        ]);

        const hasResetAvatar = avatarResetRaw === 'true';
        setIsAvatarReset(hasResetAvatar);

        if (overridesRaw) {
          setCachedOverrides(JSON.parse(overridesRaw));
        }
        if (avatarRaw && !hasResetAvatar) {
          setLocalAvatarUri(avatarRaw);
        } else {
          setLocalAvatarUri(null);
        }
        if (userDataRaw) {
          const parsed = JSON.parse(userDataRaw);
          if (!parsed.id || parsed.id === id) {
            setCachedUserData(parsed);
          } else {
            setCachedUserData(null);
          }
        } else {
          setCachedUserData(null);
        }
        if (patientProfileRaw) {
          setCachedPatientProfile(JSON.parse(patientProfileRaw));
        }
      }
    } catch (err) {
      console.warn('Error loading cached profile info:', err);
    }
  }, []);

  useEffect(() => {
    void loadAuthAndCache();
  }, [loadAuthAndCache]);

  // ── Fetch Profile from Real Backend (`GET /api/profiles/:patientId`) ──
  const {
    data: serverData,
    isLoading: isProfileLoading,
    refetch,
  } = useQuery<any>({
    queryKey: ['profile', patientId],
    queryFn: async () => {
      if (!patientId) return null;
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const token = authToken || (await SecureStore.getItemAsync('userToken')) || (await AsyncStorage.getItem('userToken'));

      let patient: any = null;
      try {
        const response = await fetch(`${API_URL}/api/profiles/${patientId}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const json = await response.json();
          patient = json.data?.patient || null;
        }
      } catch (err) {
        console.warn('Profile fetch network error:', err);
      }

      // Check settings endpoint for phone if needed
      let settingsPhone: string | null = null;
      try {
        const settingsRes = await fetch(`${API_URL}/api/users/settings`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (settingsRes.ok) {
          const sJson = await settingsRes.json();
          settingsPhone = sJson.data?.user?.phone || sJson.data?.phone || null;
        }
      } catch {}

      return {
        ...(patient || {}),
        settingsPhone,
      };
    },
    enabled: !!patientId,
  });

  useFocusEffect(
    useCallback(() => {
      void loadAuthAndCache();
      void refetch();
    }, [loadAuthAndCache, refetch])
  );

  // ── Merge Server Data with Local Cached Overrides & Storage ──
  const profile: PatientData | null = useMemo(() => {
    if (!serverData && !cachedOverrides && !cachedPatientProfile && !cachedUserData) return null;

    // Resolve phone cleanly from:
    // settingsData?.user?.phone || profileData?.user?.phone || profileData?.phone || cachedProfile?.phone || userData?.phone || userData?.phoneNumber
    const resolvedPhone =
      serverData?.settingsPhone ||
      serverData?.user?.phone ||
      serverData?.phone ||
      cachedOverrides?.phone ||
      cachedPatientProfile?.phone ||
      cachedUserData?.phone ||
      cachedUserData?.phoneNumber ||
      null;

    const resolvedName =
      cachedOverrides?.surname ||
      cachedOverrides?.name ||
      cachedPatientProfile?.surname ||
      cachedPatientProfile?.name ||
      (cachedUserData?.id === patientId ? (cachedUserData?.surname || cachedUserData?.name) : null) ||
      (serverData?.name && serverData.name !== 'New User' && serverData.name !== 'Unknown User' ? serverData.name : null) ||
      serverData?.name ||
      'Patient User';

    return {
      id: serverData?.id || patientId || '',
      name: resolvedName,
      surname: resolvedName,
      email: serverData?.email || cachedUserData?.email || '',
      username: serverData?.username || cachedUserData?.username || null,
      nic: serverData?.nic || cachedUserData?.nic || null,
      phone: resolvedPhone,
      role: serverData?.role || cachedUserData?.role || 'STUDENT',
      profile_picture: serverData?.profile_picture || null,
      student: serverData?.student
        ? {
            ...serverData.student,
            emergency_contact_name:
              cachedOverrides?.emergency_contact_name !== undefined
                ? cachedOverrides.emergency_contact_name
                : serverData.student.emergency_contact_name ?? cachedPatientProfile?.emergency_contact_name ?? null,
            emergency_contact_relationship:
              cachedOverrides?.emergency_contact_relationship !== undefined
                ? cachedOverrides.emergency_contact_relationship
                : serverData.student.emergency_contact_relationship ?? cachedPatientProfile?.emergency_contact_relationship ?? null,
            emergency_contact_number:
              cachedOverrides?.emergency_contact_number !== undefined
                ? cachedOverrides.emergency_contact_number
                : serverData.student.emergency_contact_number ?? cachedPatientProfile?.emergency_contact_number ?? null,
          }
        : cachedPatientProfile?.emergency_contact_number
        ? {
            student_id: patientId || '',
            university_reg_number: cachedPatientProfile?.university_reg_number || '',
            university_email: cachedPatientProfile?.university_email || null,
            faculty: cachedPatientProfile?.faculty || '',
            department: cachedPatientProfile?.department || null,
            year_of_study: cachedPatientProfile?.year_of_study || 1,
            batch: cachedPatientProfile?.batch || '',
            emergency_contact_name: cachedOverrides?.emergency_contact_name ?? cachedPatientProfile?.emergency_contact_name ?? null,
            emergency_contact_relationship: cachedOverrides?.emergency_contact_relationship ?? cachedPatientProfile?.emergency_contact_relationship ?? null,
            emergency_contact_number: cachedOverrides?.emergency_contact_number ?? cachedPatientProfile?.emergency_contact_number ?? null,
          }
        : null,
      academicStaff: serverData?.academicStaff
        ? {
            ...serverData.academicStaff,
            emergency_contact_name:
              cachedOverrides?.emergency_contact_name !== undefined
                ? cachedOverrides.emergency_contact_name
                : serverData.academicStaff.emergency_contact_name ?? cachedPatientProfile?.emergency_contact_name ?? null,
            emergency_contact_relationship:
              cachedOverrides?.emergency_contact_relationship !== undefined
                ? cachedOverrides.emergency_contact_relationship
                : serverData.academicStaff.emergency_contact_relationship ?? cachedPatientProfile?.emergency_contact_relationship ?? null,
            emergency_contact_number:
              cachedOverrides?.emergency_contact_number !== undefined
                ? cachedOverrides.emergency_contact_number
                : serverData.academicStaff.emergency_contact_number ?? cachedPatientProfile?.emergency_contact_number ?? null,
          }
        : null,
      patientProfile: {
        user_id: serverData?.id || patientId || '',
        blood_group:
          cachedOverrides?.blood_group !== undefined
            ? cachedOverrides.blood_group
            : serverData?.patientProfile?.blood_group ?? null,
        allergies:
          cachedOverrides?.allergies !== undefined
            ? cachedOverrides.allergies
            : serverData?.patientProfile?.allergies ?? null,
        special_notes:
          cachedOverrides?.special_notes !== undefined
            ? cachedOverrides.special_notes
            : serverData?.patientProfile?.special_notes ?? null,
        height:
          cachedOverrides?.height !== undefined
            ? cachedOverrides.height
            : serverData?.patientProfile?.height ?? null,
        weight:
          cachedOverrides?.weight !== undefined
            ? cachedOverrides.weight
            : serverData?.patientProfile?.weight ?? null,
        date_of_birth:
          cachedOverrides?.date_of_birth !== undefined
            ? cachedOverrides.date_of_birth
            : serverData?.patientProfile?.date_of_birth ?? null,
      },
    };
  }, [serverData, cachedOverrides, cachedPatientProfile, cachedUserData, patientId]);

  // ── Pull-to-Refresh Handler ──
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // ── Helper: Format Date of Birth ──
  const formatDob = (dobString?: string | null): string => {
    if (!dobString) return 'Not Set';
    const d = new Date(dobString);
    if (isNaN(d.getTime())) return dobString;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // ── Helper: Calculate Age in Years ──
  const calculateAge = (dobString?: string | null): string | null => {
    if (!dobString) return null;
    const birthDate = new Date(dobString);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? `${age} yrs` : null;
  };

  // ── Helper: Compute Body Mass Index (BMI) & Category ──
  const bmiInfo = useMemo(() => {
    const heightCm = profile?.patientProfile?.height;
    const weightKg = profile?.patientProfile?.weight;

    if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
      return null;
    }

    const heightM = heightCm / 100;
    const bmiVal = weightKg / (heightM * heightM);
    const numericBmi = parseFloat(bmiVal.toFixed(1));

    let category = 'Normal';
    let color = '#2E7D32';
    let bg = '#E8F5E9';

    if (numericBmi < 18.5) {
      category = 'Underweight';
      color = '#3A82A8';
      bg = '#E3F1F8';
    } else if (numericBmi < 25.0) {
      category = 'Normal';
      color = '#2E7D32';
      bg = '#E8F5E9';
    } else if (numericBmi < 30.0) {
      category = 'Overweight';
      color = '#C97A1E';
      bg = '#FFF3E0';
    } else {
      category = 'Obese';
      color = '#C94A4A';
      bg = '#FCE8E6';
    }

    return { value: numericBmi, category, color, bg };
  }, [profile?.patientProfile?.height, profile?.patientProfile?.weight]);

  // ── Helper: Live Preview BMI in Modal ──
  const modalLiveBmi = useMemo(() => {
    const h = parseFloat(editHeight);
    const w = parseFloat(editWeight);
    if (isNaN(h) || isNaN(w) || h <= 0 || w <= 0) return null;
    const hM = h / 100;
    const bmi = w / (hM * hM);
    return parseFloat(bmi.toFixed(1));
  }, [editHeight, editWeight]);

  // ── Helper: Parse Allergies list into distinct tags ──
  const allergyTags = useMemo(() => {
    const raw = profile?.patientProfile?.allergies;
    if (!raw || !raw.trim()) return [];
    return raw
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [profile?.patientProfile?.allergies]);

  // ── Open Edit Modal & Populate Current Data ──
  const handleOpenEditModal = () => {
    setEditName(profile?.name || '');
    setEditPhone(profile?.phone || '');
    setEditGuardianName(guardianName || '');
    setEditGuardianRelation(guardianRelation || 'Father');
    setEditGuardianPhone(guardianPhone || '');
    const dob = profile?.patientProfile?.date_of_birth;
    if (dob) {
      const d = new Date(dob);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setEditDob(`${yyyy}-${mm}-${dd}`);
      } else {
        setEditDob(dob);
      }
    } else {
      setEditDob('');
    }
    setEditBloodGroup(profile?.patientProfile?.blood_group || null);
    setEditHeight(profile?.patientProfile?.height ? String(profile.patientProfile.height) : '');
    setEditWeight(profile?.patientProfile?.weight ? String(profile.patientProfile.weight) : '');
    setEditAllergies(profile?.patientProfile?.allergies || '');
    setEditSpecialNotes(profile?.patientProfile?.special_notes || '');
    setIsEditModalVisible(true);
  };

  // ── Date Picker Logic ──
  const handleOpenDatePicker = () => {
    if (editDob && /^\d{4}-\d{2}-\d{2}$/.test(editDob)) {
      const [y, m, d] = editDob.split('-').map(Number);
      setPickerYear(y);
      setPickerMonth(m - 1);
      setPickerDay(d);
    } else {
      setPickerYear(2002);
      setPickerMonth(11);
      setPickerDay(23);
    }
    setIsYearPickerMode(false);
    setIsDatePickerVisible(true);
  };

  const handlePrevMonth = () => {
    if (pickerMonth === 0) {
      setPickerMonth(11);
      setPickerYear((y) => y - 1);
    } else {
      setPickerMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (pickerMonth === 11) {
      setPickerMonth(0);
      setPickerYear((y) => y + 1);
    } else {
      setPickerMonth((m) => m + 1);
    }
  };

  const handleConfirmDatePicker = () => {
    const mm = String(pickerMonth + 1).padStart(2, '0');
    const dd = String(pickerDay).padStart(2, '0');
    setEditDob(`${pickerYear}-${mm}-${dd}`);
    setIsDatePickerVisible(false);
  };

  // Calendar Day Grid Computation
  const calendarDays = useMemo(() => {
    const daysInCurrentMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const firstDayIndex = new Date(pickerYear, pickerMonth, 1).getDay(); // 0 = Sun
    return { daysInCurrentMonth, firstDayIndex };
  }, [pickerYear, pickerMonth]);

  // Available Years for Quick Year Selection (1950 - 2026)
  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = 2026; y >= 1950; y--) {
      years.push(y);
    }
    return years;
  }, []);

  // ── Height & Weight Stepper Handlers ──
  const handleStepHeight = (delta: number) => {
    const current = parseFloat(editHeight) || 170;
    const next = Math.max(50, Math.min(250, current + delta));
    setEditHeight(String(next));
  };

  const handleStepWeight = (delta: number) => {
    const current = parseFloat(editWeight) || 65;
    const next = Math.max(30, Math.min(250, Math.round((current + delta) * 10) / 10));
    setEditWeight(String(next));
  };

  // ── Save Profile & Health Information ──
  const handleSaveProfile = async () => {
    if (editDob && editDob.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(editDob.trim())) {
        Alert.alert(
          'Invalid Date Format',
          'Please enter your Date of Birth in YYYY-MM-DD format (e.g. 2002-05-14).'
        );
        return;
      }
    }

    if (
      editHeight &&
      (isNaN(Number(editHeight)) || Number(editHeight) <= 0 || Number(editHeight) > 300)
    ) {
      Alert.alert('Invalid Height', 'Please enter a valid height in centimeters (e.g. 175).');
      return;
    }

    if (
      editWeight &&
      (isNaN(Number(editWeight)) || Number(editWeight) <= 0 || Number(editWeight) > 500)
    ) {
      Alert.alert('Invalid Weight', 'Please enter a valid weight in kilograms (e.g. 68).');
      return;
    }

    setIsSavingProfile(true);
    const API_URL = process.env.EXPO_PUBLIC_API_URL;
    const token =
      authToken ||
      (await SecureStore.getItemAsync('userToken')) ||
      (await AsyncStorage.getItem('userToken'));

    try {
      // 1. Call `PATCH /api/users/settings` for Phone Number and Guardian details
      const settingsPayload: Record<string, any> = {};
      if (editPhone.trim()) {
        settingsPayload.phone = editPhone.trim();
      }
      if (editGuardianName.trim()) {
        settingsPayload.emergency_contact_name = editGuardianName.trim();
      }
      if (editGuardianRelation.trim()) {
        settingsPayload.emergency_contact_relationship = editGuardianRelation.trim();
      }
      if (editGuardianPhone.trim()) {
        settingsPayload.emergency_contact_number = editGuardianPhone.trim();
      }

      if (Object.keys(settingsPayload).length > 0) {
        try {
          await fetch(`${API_URL}/api/users/settings`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(settingsPayload),
          });
        } catch (settingsErr) {
          console.warn('Settings API patch error:', settingsErr);
        }
      }

      // 2. Call `PUT /api/profiles/:patientId` for Height, Weight, Date of Birth
      const clinicalPayload: Record<string, any> = {};
      if (editHeight && !isNaN(Number(editHeight))) {
        clinicalPayload.height = Number(editHeight);
      }
      if (editWeight && !isNaN(Number(editWeight))) {
        clinicalPayload.weight = Number(editWeight);
      }
      if (editDob && editDob.trim()) {
        clinicalPayload.date_of_birth = editDob.trim();
      }

      if (Object.keys(clinicalPayload).length > 0 && patientId) {
        try {
          await fetch(`${API_URL}/api/profiles/${patientId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(clinicalPayload),
          });
        } catch (profileApiErr) {
          console.warn('Clinical profile API update error:', profileApiErr);
        }
      }

      // 3. Save Complete Overrides (including Surname, Phone, Guardian, Blood Group, Allergies, Special Notes)
      // to local AsyncStorage cache so they persist reliably on device across reloads
      const surnameVal = editName.trim() || profile?.name || '';
      const phoneVal = editPhone.trim() || profile?.phone || '';

      const updatedOverrides: LocalProfileOverrides = {
        name: surnameVal,
        surname: surnameVal,
        phone: phoneVal,
        blood_group: editBloodGroup,
        allergies: editAllergies.trim() || null,
        special_notes: editSpecialNotes.trim() || null,
        height: editHeight ? Number(editHeight) : null,
        weight: editWeight ? Number(editWeight) : null,
        date_of_birth: editDob.trim() || null,
        emergency_contact_name: editGuardianName.trim() || null,
        emergency_contact_relationship: editGuardianRelation.trim() || null,
        emergency_contact_number: editGuardianPhone.trim() || null,
      };

      if (patientId) {
        await AsyncStorage.setItem(
          `patient_profile_overrides_${patientId}`,
          JSON.stringify(updatedOverrides)
        );

        const existingPatientProfRaw = await AsyncStorage.getItem(`patientProfile_${patientId}`);
        const parsedPatientProf = existingPatientProfRaw ? JSON.parse(existingPatientProfRaw) : {};
        await AsyncStorage.setItem(
          `patientProfile_${patientId}`,
          JSON.stringify({
            ...parsedPatientProf,
            name: surnameVal,
            surname: surnameVal,
            phone: phoneVal,
            emergency_contact_name: editGuardianName.trim() || null,
            emergency_contact_relationship: editGuardianRelation.trim() || null,
            emergency_contact_number: editGuardianPhone.trim() || null,
            is_profile_complete: true,
          })
        );

        await AsyncStorage.setItem(`profileCompleted_${patientId}`, 'true');
      }

      const rawUserData = await AsyncStorage.getItem('userData');
      const parsedUserData = rawUserData ? JSON.parse(rawUserData) : {};
      await AsyncStorage.setItem(
        'userData',
        JSON.stringify({
          ...parsedUserData,
          id: patientId,
          name: surnameVal,
          surname: surnameVal,
          phone: phoneVal,
          is_profile_complete: true,
          profileCompleted: true,
        })
      );
      await AsyncStorage.setItem('is_profile_complete', 'true');

      setCachedOverrides(updatedOverrides);
      setCachedUserData({
        ...(parsedUserData || {}),
        name: surnameVal,
        surname: surnameVal,
        phone: phoneVal,
        is_profile_complete: true,
        profileCompleted: true,
      });

      // Invalidate React Query Cache to sync
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      if (patientId) {
        await queryClient.invalidateQueries({ queryKey: ['profile', patientId] });
      }

      setIsEditModalVisible(false);
      Alert.alert('Profile Updated', 'Your profile and health baseline have been successfully saved.');
    } catch (err: any) {
      console.error('Error saving profile:', err);
      Alert.alert('Save Error', 'Could not save profile changes. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ── Image Picker & Live Avatar Upload ──
  const handleImagePick = async (useCamera: boolean) => {
    setIsPhotoSheetVisible(false);
    try {
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      };

      let result: ImagePicker.ImagePickerResult;

      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (!status || status !== 'granted') {
          Alert.alert('Permission Required', 'Camera permission is needed to take a profile photo.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(pickerOptions);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!status || status !== 'granted') {
          Alert.alert('Permission Required', 'Gallery access is needed to select a profile photo.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setLocalAvatarUri(asset.uri);
        setIsAvatarReset(false);
        setAvatarImageError(false);

        if (patientId) {
          await AsyncStorage.setItem(`patient_avatar_${patientId}`, asset.uri);
          await AsyncStorage.removeItem(`patient_avatar_reset_${patientId}`);
        }

        // Upload to backend endpoint: `POST /api/users/profile-picture`
        setIsUploadingPhoto(true);
        const API_URL = process.env.EXPO_PUBLIC_API_URL;
        const token =
          authToken ||
          (await SecureStore.getItemAsync('userToken')) ||
          (await AsyncStorage.getItem('userToken'));

        try {
          const formData = new FormData();
          formData.append('image', {
            uri: asset.uri,
            name: asset.fileName || `avatar_${Date.now()}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          } as any);

          const uploadRes = await fetch(`${API_URL}/api/users/profile-picture`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          });

          const uploadData = await uploadRes.json();
          if (uploadRes.ok && uploadData?.data?.url) {
            setLocalAvatarUri(uploadData.data.url);
            if (patientId) {
              await AsyncStorage.setItem(`patient_avatar_${patientId}`, uploadData.data.url);
              await AsyncStorage.removeItem(`patient_avatar_reset_${patientId}`);
            }
            await queryClient.invalidateQueries({ queryKey: ['profile', patientId] });
            Alert.alert('Success', 'Profile photo updated successfully!');
          }
        } catch (uploadErr) {
          console.warn('Avatar cloud upload warning:', uploadErr);
        } finally {
          setIsUploadingPhoto(false);
        }
      }
    } catch (err) {
      console.error('Image picker error:', err);
      Alert.alert('Error', 'Unable to pick image. Please try again.');
    }
  };

  // ── Reset to Initial Avatar Badge ──
  const handleResetToInitialAvatar = async () => {
    setIsPhotoSheetVisible(false);
    try {
      if (patientId) {
        await AsyncStorage.removeItem(`patient_avatar_${patientId}`);
        await AsyncStorage.setItem(`patient_avatar_reset_${patientId}`, 'true');
      }
      setLocalAvatarUri(null);
      setIsAvatarReset(true);
      setAvatarImageError(false);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      if (patientId) {
        await queryClient.invalidateQueries({ queryKey: ['profile', patientId] });
      }
      Alert.alert('Avatar Reset', 'Your avatar has been reset to your clean initial badge.');
    } catch (err) {
      console.warn('Error resetting avatar:', err);
    }
  };

  // ── Logout Handler with Confirmation ──
  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to sign out of your patient account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (err) {
              console.error('Logout failed:', err);
              router.replace('/login');
            }
          },
        },
      ]
    );
  };

  // ── Guardian / Emergency Contact Details Resolution ──
  const contactPerson = profile?.student || profile?.academicStaff;
  const guardianName =
    cachedOverrides?.emergency_contact_name !== undefined
      ? cachedOverrides.emergency_contact_name
      : contactPerson?.emergency_contact_name ?? cachedPatientProfile?.emergency_contact_name ?? null;

  const guardianRelation =
    cachedOverrides?.emergency_contact_relationship !== undefined
      ? cachedOverrides.emergency_contact_relationship
      : contactPerson?.emergency_contact_relationship ?? cachedPatientProfile?.emergency_contact_relationship ?? null;

  const guardianPhone =
    cachedOverrides?.emergency_contact_number !== undefined
      ? cachedOverrides.emergency_contact_number
      : contactPerson?.emergency_contact_number ?? cachedPatientProfile?.emergency_contact_number ?? null;

  const hasGuardianContact = Boolean(
    (guardianName && guardianName.trim() !== '' && guardianName !== 'N/A') ||
    (guardianPhone && guardianPhone.trim() !== '' && guardianPhone !== '0000000000')
  );

  const handleCallGuardian = async (phoneToCall?: string | null) => {
    if (!phoneToCall) return;
    const cleaned = phoneToCall.replace(/[^\d+]/g, '');
    if (!cleaned) return;
    try {
      await Linking.openURL(`tel:${cleaned}`);
    } catch (e) {
      Alert.alert('Unable to Open Dialer', `Please dial ${phoneToCall} manually.`);
    }
  };

  // Determine avatar to display (photo or single-letter initial fallback)
  const displayAvatar = isAvatarReset ? null : (localAvatarUri || profile?.profile_picture || null);
  const displayInitial = (
    profile?.surname ||
    profile?.name ||
    cachedUserData?.surname ||
    cachedUserData?.name ||
    'U'
  ).trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#D5E6DC" />

      {/* ── TOP HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>My Patient Profile</Text>
          <Text style={styles.headerSubtitle}>University Health & Medical Center</Text>
        </View>

        <TouchableOpacity
          style={styles.editProfileHeaderBtn}
          onPress={handleOpenEditModal}
          activeOpacity={0.8}
        >
          <Feather name="edit-3" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.editProfileHeaderBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#3B6E5C']}
            tintColor="#3B6E5C"
          />
        }
      >
        {/* ── SECTION 1: IDENTITY & ACADEMIC CARD ── */}
        <View style={styles.identityCard}>
          {/* Avatar with Camera Badge */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatarRing}>
              {displayAvatar && !avatarImageError ? (
                <Image
                  source={{ uri: displayAvatar }}
                  style={styles.avatarImage}
                  onError={() => setAvatarImageError(true)}
                />
              ) : (
                <View style={styles.avatarInitialCircle}>
                  <Text style={styles.avatarInitialText}>{displayInitial}</Text>
                </View>
              )}
              {isUploadingPhoto && (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.cameraIconBadge}
              onPress={() => setIsPhotoSheetVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={17} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {isProfileLoading ? (
            <ActivityIndicator size="small" color="#3B6E5C" style={{ marginVertical: 14 }} />
          ) : (
            <View style={styles.identityDetails}>
              <Text style={styles.patientFullName}>{profile?.name || 'Patient User'}</Text>

              {profile?.username ? (
                <Text style={styles.patientUsername}>@{profile.username}</Text>
              ) : null}

              {/* Role Badge */}
              <View style={styles.roleBadgeContainer}>
                {profile?.role === 'STUDENT' ? (
                  <View style={[styles.roleBadge, styles.studentBadge]}>
                    <Ionicons name="school" size={13} color="#2E7D32" style={{ marginRight: 4 }} />
                    <Text style={styles.studentBadgeText}>STUDENT PATIENT</Text>
                  </View>
                ) : profile?.role === 'ACADEMIC_STAFF' ? (
                  <View style={[styles.roleBadge, styles.staffBadge]}>
                    <Ionicons name="briefcase" size={13} color="#1976D2" style={{ marginRight: 4 }} />
                    <Text style={styles.staffBadgeText}>ACADEMIC STAFF</Text>
                  </View>
                ) : (
                  <View style={[styles.roleBadge, styles.generalBadge]}>
                    <Ionicons name="medical" size={13} color="#3B6E5C" style={{ marginRight: 4 }} />
                    <Text style={styles.generalBadgeText}>REGISTERED PATIENT</Text>
                  </View>
                )}
              </View>

              {/* Identity Metadata Rows */}
              <View style={styles.metaInfoTable}>
                {/* Surname */}
                <View style={styles.metaInfoRow}>
                  <View style={styles.metaIconCol}>
                    <Ionicons name="person-outline" size={16} color="#3B6E5C" />
                  </View>
                  <Text style={styles.metaLabel}>Surname</Text>
                  <Text style={styles.metaValue}>{profile?.name || 'Not Set'}</Text>
                </View>

                {/* Registration / Staff ID */}
                <View style={styles.metaInfoRow}>
                  <View style={styles.metaIconCol}>
                    <MaterialCommunityIcons name="card-account-details-outline" size={16} color="#3B6E5C" />
                  </View>
                  <Text style={styles.metaLabel}>
                    {profile?.role === 'STUDENT' ? 'Reg Number' : 'Staff ID'}
                  </Text>
                  <Text style={styles.metaValue}>
                    {profile?.student?.university_reg_number ||
                      profile?.academicStaff?.university_staff_id ||
                      'Not Registered'}
                  </Text>
                </View>

                {/* Faculty & Department */}
                {profile?.student?.faculty || profile?.academicStaff?.department ? (
                  <View style={styles.metaInfoRow}>
                    <View style={styles.metaIconCol}>
                      <MaterialCommunityIcons name="domain" size={16} color="#3B6E5C" />
                    </View>
                    <Text style={styles.metaLabel}>Faculty / Dept</Text>
                    <Text style={styles.metaValue} numberOfLines={1}>
                      {profile?.student?.faculty
                        ? `${profile.student.faculty} ${
                            profile.student.department ? `(${profile.student.department})` : ''
                          }`
                        : profile?.academicStaff?.department || 'Faculty of Engineering'}
                    </Text>
                  </View>
                ) : null}

                {/* Batch / Academic Year (Students) or Position (Staff) */}
                {profile?.student ? (
                  <View style={styles.metaInfoRow}>
                    <View style={styles.metaIconCol}>
                      <Ionicons name="calendar-clear-outline" size={16} color="#3B6E5C" />
                    </View>
                    <Text style={styles.metaLabel}>Academic Year</Text>
                    <Text style={styles.metaValue}>
                      Year {profile.student.year_of_study} • {profile.student.batch}
                    </Text>
                  </View>
                ) : profile?.academicStaff?.position ? (
                  <View style={styles.metaInfoRow}>
                    <View style={styles.metaIconCol}>
                      <Ionicons name="ribbon-outline" size={16} color="#3B6E5C" />
                    </View>
                    <Text style={styles.metaLabel}>Position</Text>
                    <Text style={styles.metaValue}>{profile.academicStaff.position}</Text>
                  </View>
                ) : null}

                {/* NIC */}
                {profile?.nic ? (
                  <View style={styles.metaInfoRow}>
                    <View style={styles.metaIconCol}>
                      <Feather name="shield" size={15} color="#3B6E5C" />
                    </View>
                    <Text style={styles.metaLabel}>National NIC</Text>
                    <Text style={styles.metaValue}>{profile.nic}</Text>
                  </View>
                ) : null}

                {/* University / Personal Email */}
                <View style={styles.metaInfoRow}>
                  <View style={styles.metaIconCol}>
                    <Ionicons name="mail-outline" size={16} color="#3B6E5C" />
                  </View>
                  <Text style={styles.metaLabel}>Email</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>
                    {profile?.student?.university_email ||
                      profile?.academicStaff?.university_email ||
                      profile?.email ||
                      'Not Set'}
                  </Text>
                </View>

                {/* Contact Phone */}
                <View style={[styles.metaInfoRow, !hasGuardianContact && { borderBottomWidth: 0 }]}>
                  <View style={styles.metaIconCol}>
                    <Ionicons name="call-outline" size={16} color="#3B6E5C" />
                  </View>
                  <Text style={styles.metaLabel}>Phone</Text>
                  <Text style={styles.metaValue}>{profile?.phone || 'Not Set'}</Text>
                </View>

                {/* Guardian / Emergency Contact in Meta Table */}
                {hasGuardianContact ? (
                  <View style={[styles.metaInfoRow, { borderBottomWidth: 0 }]}>
                    <View style={styles.metaIconCol}>
                      <Ionicons name="shield-checkmark-outline" size={16} color="#3B6E5C" />
                    </View>
                    <Text style={styles.metaLabel}>Guardian</Text>
                    <Text style={styles.metaValue} numberOfLines={1}>
                      {guardianName
                        ? `${guardianName}${guardianRelation ? ` (${guardianRelation})` : ''}`
                        : guardianPhone}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        </View>

        {/* ── SECTION: GUARDIAN / EMERGENCY CONTACT CARD ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>Guardian / Emergency Contact</Text>
          <TouchableOpacity onPress={handleOpenEditModal} activeOpacity={0.7}>
            <Text style={styles.sectionActionText}>{hasGuardianContact ? 'Edit Contact' : 'Add Contact'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.guardianCard}>
          {hasGuardianContact ? (
            <View style={styles.guardianCardContent}>
              <View style={styles.guardianCardLeft}>
                <View style={styles.guardianIconPill}>
                  <Ionicons name="shield-checkmark" size={22} color="#1B5E4B" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.guardianNameRow}>
                    <Text style={styles.guardianNameText} numberOfLines={1}>
                      {guardianName || 'Guardian Contact'}
                    </Text>
                    {guardianRelation ? (
                      <View style={styles.guardianRelationBadge}>
                        <Text style={styles.guardianRelationBadgeText}>{guardianRelation}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.guardianPhoneText}>
                    {guardianPhone || 'Phone number not set'}
                  </Text>
                </View>
              </View>

              {guardianPhone ? (
                <TouchableOpacity
                  style={styles.guardianCallButton}
                  onPress={() => handleCallGuardian(guardianPhone)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="call" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.guardianCallButtonText}>Call</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.emptyGuardianCard}
              onPress={handleOpenEditModal}
              activeOpacity={0.75}
            >
              <View style={styles.emptyGuardianIconCircle}>
                <Ionicons name="person-add-outline" size={22} color="#3B6E5C" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.emptyGuardianTitle}>No Emergency Contact Set</Text>
                <Text style={styles.emptyGuardianSubtitle}>
                  Add parent or guardian details for medical emergencies
                </Text>
              </View>
              <View style={styles.emptyGuardianAddBadge}>
                <Text style={styles.emptyGuardianAddBadgeText}>Add</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── SECTION 2: PHYSICAL VITALS & HEALTH BASELINE GRID ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>Physical Vitals & Metrics</Text>
          <TouchableOpacity onPress={handleOpenEditModal} activeOpacity={0.7}>
            <Text style={styles.sectionActionText}>Update Vitals</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.vitalsGrid}>
          {/* Card 1: Blood Group */}
          <View style={styles.vitalCard}>
            <View style={[styles.vitalIconPill, { backgroundColor: '#FCE8E6' }]}>
              <FontAwesome5 name="tint" size={18} color="#C94A4A" />
            </View>
            <Text style={styles.vitalLabel}>Blood Group</Text>
            <Text style={styles.vitalValue}>
              {profile?.patientProfile?.blood_group || 'Not Set'}
            </Text>
            <Text style={styles.vitalSub}>
              {profile?.patientProfile?.blood_group ? 'Verified Baseline' : 'Tap Edit to set'}
            </Text>
          </View>

          {/* Card 2: Height */}
          <View style={styles.vitalCard}>
            <View style={[styles.vitalIconPill, { backgroundColor: '#E2F5E9' }]}>
              <MaterialCommunityIcons name="human-male-height" size={20} color="#3B6E5C" />
            </View>
            <Text style={styles.vitalLabel}>Height</Text>
            <Text style={styles.vitalValue}>
              {profile?.patientProfile?.height ? `${profile.patientProfile.height} cm` : '-- cm'}
            </Text>
            <Text style={styles.vitalSub}>
              {profile?.patientProfile?.height
                ? `${(profile.patientProfile.height / 30.48).toFixed(1)} ft`
                : 'Metric height'}
            </Text>
          </View>

          {/* Card 3: Weight */}
          <View style={styles.vitalCard}>
            <View style={[styles.vitalIconPill, { backgroundColor: '#E3F1F8' }]}>
              <MaterialCommunityIcons name="scale-bathroom" size={19} color="#3A82A8" />
            </View>
            <Text style={styles.vitalLabel}>Weight</Text>
            <Text style={styles.vitalValue}>
              {profile?.patientProfile?.weight ? `${profile.patientProfile.weight} kg` : '-- kg'}
            </Text>
            <Text style={styles.vitalSub}>
              {profile?.patientProfile?.weight
                ? `${(profile.patientProfile.weight * 2.20462).toFixed(1)} lbs`
                : 'Body mass'}
            </Text>
          </View>

          {/* Card 4: Calculated BMI */}
          <View style={styles.vitalCard}>
            <View style={[styles.vitalIconPill, { backgroundColor: bmiInfo?.bg || '#EAF3ED' }]}>
              <MaterialCommunityIcons
                name="speedometer"
                size={20}
                color={bmiInfo?.color || '#3B6E5C'}
              />
            </View>
            <Text style={styles.vitalLabel}>BMI Score</Text>
            <Text style={styles.vitalValue}>{bmiInfo ? `${bmiInfo.value}` : '--'}</Text>
            <View style={[styles.bmiPill, { backgroundColor: bmiInfo?.bg || '#F1F5F3' }]}>
              <Text style={[styles.bmiPillText, { color: bmiInfo?.color || '#72857B' }]}>
                {bmiInfo?.category || 'Awaiting Vitals'}
              </Text>
            </View>
          </View>
        </View>

        {/* Card 5: Full-Width Date of Birth & Age Card */}
        <View style={styles.dobCard}>
          <View style={[styles.vitalIconPill, { backgroundColor: '#E8F3F8', marginRight: 14 }]}>
            <Ionicons name="calendar" size={19} color="#3B85A6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.vitalLabel}>Date of Birth & Age</Text>
            <Text style={styles.dobValueText}>
              {formatDob(profile?.patientProfile?.date_of_birth)}
            </Text>
          </View>
          {calculateAge(profile?.patientProfile?.date_of_birth) ? (
            <View style={styles.agePill}>
              <Text style={styles.agePillText}>
                {calculateAge(profile?.patientProfile?.date_of_birth)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── SECTION 3: CRITICAL MEDICAL INFORMATION ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>Clinical & Medical Baseline</Text>
        </View>

        {/* Card: Known Allergies */}
        <View style={styles.clinicalCard}>
          <View style={styles.clinicalCardHeader}>
            <View style={[styles.clinicalIconCircle, { backgroundColor: '#FFF3E0' }]}>
              <MaterialCommunityIcons name="shield-alert-outline" size={18} color="#C97A1E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clinicalCardTitle}>Known Allergies & Drug Reactions</Text>
              <Text style={styles.clinicalCardSubtitle}>Critical alerts for medical dispensing</Text>
            </View>
          </View>

          {allergyTags.length > 0 ? (
            <View style={styles.allergyTagContainer}>
              {allergyTags.map((tag, idx) => (
                <View key={idx} style={styles.allergyPill}>
                  <Ionicons name="alert-circle" size={13} color="#C94A4A" style={{ marginRight: 5 }} />
                  <Text style={styles.allergyPillText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyClinicalRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#2E7D32" style={{ marginRight: 6 }} />
              <Text style={styles.emptyClinicalText}>No known drug or food allergies recorded.</Text>
            </View>
          )}
        </View>

        {/* Card: Special Medical Notes & Conditions */}
        <View style={styles.clinicalCard}>
          <View style={styles.clinicalCardHeader}>
            <View style={[styles.clinicalIconCircle, { backgroundColor: '#E2F5E9' }]}>
              <MaterialCommunityIcons name="clipboard-pulse-outline" size={18} color="#3B6E5C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clinicalCardTitle}>Special Medical Notes & Conditions</Text>
              <Text style={styles.clinicalCardSubtitle}>
                Chronic conditions, surgical history, or ongoing care
              </Text>
            </View>
          </View>

          <Text style={styles.specialNotesText}>
            {profile?.patientProfile?.special_notes ||
              'No chronic health conditions, dietary restrictions, or clinical notes recorded on file.'}
          </Text>

          {/* Verification Badge */}
          <View style={styles.verifiedFooterBanner}>
            <MaterialCommunityIcons name="shield-check" size={15} color="#3B6E5C" style={{ marginRight: 6 }} />
            <Text style={styles.verifiedFooterText}>
              Official records and blood classifications are verified by Medical Center healthcare staff.
            </Text>
          </View>
        </View>

        {/* ── SECTION 4: QUICK NAVIGATION & ACCOUNT ACTIONS FOOTER ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>Medical Services & Account</Text>
        </View>

        <View style={styles.navigationMenuCard}>
          {/* Records */}
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => router.push('/(tabs)/records')}
            activeOpacity={0.7}
          >
            <View style={[styles.navIconBox, { backgroundColor: '#E2F5E9' }]}>
              <Ionicons name="document-text-outline" size={18} color="#3B6E5C" />
            </View>
            <View style={styles.navTextCol}>
              <Text style={styles.navTitle}>My Medical Records & Visits</Text>
              <Text style={styles.navSub}>Consultation notes, vitals, and lab reports</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9BB5A9" />
          </TouchableOpacity>

          <View style={styles.navDivider} />

          {/* Prescriptions */}
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => router.push('/(tabs)/prescriptions')}
            activeOpacity={0.7}
          >
            <View style={[styles.navIconBox, { backgroundColor: '#FCE8E6' }]}>
              <MaterialCommunityIcons name="pill" size={18} color="#C94A4A" />
            </View>
            <View style={styles.navTextCol}>
              <Text style={styles.navTitle}>My Prescriptions</Text>
              <Text style={styles.navSub}>Active medication dosages and pharmacy orders</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9BB5A9" />
          </TouchableOpacity>

          <View style={styles.navDivider} />

          {/* Medical Certificates */}
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => router.push('/academic-submission')}
            activeOpacity={0.7}
          >
            <View style={[styles.navIconBox, { backgroundColor: '#E8F3F8' }]}>
              <MaterialCommunityIcons name="certificate-outline" size={18} color="#3B85A6" />
            </View>
            <View style={styles.navTextCol}>
              <Text style={styles.navTitle}>Medical Leave Certificates</Text>
              <Text style={styles.navSub}>Request or track academic leave submissions</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9BB5A9" />
          </TouchableOpacity>

          <View style={styles.navDivider} />

          {/* App Settings */}
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => router.push('/(tabs)/settings')}
            activeOpacity={0.7}
          >
            <View style={[styles.navIconBox, { backgroundColor: '#F1F5F3' }]}>
              <Ionicons name="settings-outline" size={18} color="#4A5952" />
            </View>
            <View style={styles.navTextCol}>
              <Text style={styles.navTitle}>App Security & Settings</Text>
              <Text style={styles.navSub}>Biometrics, PIN lock, and app notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9BB5A9" />
          </TouchableOpacity>

          <View style={styles.navDivider} />

          {/* Sign Out */}
          <TouchableOpacity
            style={[styles.navRow, { paddingVertical: 14 }]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={[styles.navIconBox, { backgroundColor: '#FFF5F5' }]}>
              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
            </View>
            <View style={styles.navTextCol}>
              <Text style={[styles.navTitle, { color: '#DC2626' }]}>Sign Out</Text>
              <Text style={styles.navSub}>Safely log out from this device</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── MODAL 1: PHOTO ACTION SHEET ── */}
      <Modal
        visible={isPhotoSheetVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsPhotoSheetVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.photoSheetContent}>
            <View style={styles.photoSheetIndicator} />
            <Text style={styles.photoSheetTitle}>Update Profile Photo</Text>
            <Text style={styles.photoSheetSub}>
              Select a new profile image to display across medical records
            </Text>

            <TouchableOpacity
              style={styles.photoSheetOption}
              onPress={() => handleImagePick(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.photoOptionIconCircle, { backgroundColor: '#E2F5E9' }]}>
                <Ionicons name="camera-outline" size={20} color="#3B6E5C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.photoSheetOptionTitle}>Take Photo with Camera</Text>
                <Text style={styles.photoSheetOptionSub}>Snap a new picture right now</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoSheetOption}
              onPress={() => handleImagePick(false)}
              activeOpacity={0.7}
            >
              <View style={[styles.photoOptionIconCircle, { backgroundColor: '#E3F1F8' }]}>
                <Ionicons name="images-outline" size={20} color="#3A82A8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.photoSheetOptionTitle}>Choose from Photo Gallery</Text>
                <Text style={styles.photoSheetOptionSub}>Upload from your saved device photos</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoSheetOption}
              onPress={handleResetToInitialAvatar}
              activeOpacity={0.7}
            >
              <View style={[styles.photoOptionIconCircle, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="refresh-outline" size={20} color="#B45309" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.photoSheetOptionTitle}>Use Initial Avatar (Reset Photo)</Text>
                <Text style={styles.photoSheetOptionSub}>Switch back to clean single-letter initial badge</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoSheetCancel}
              onPress={() => setIsPhotoSheetVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.photoSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 2: INTERACTIVE EDIT PROFILE & HEALTH INFO MODAL ── */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <View style={styles.editModalContainer}>
            {/* Modal Header */}
            <View style={styles.editModalHeader}>
              <View>
                <Text style={styles.editModalTitle}>Edit Profile & Health Info</Text>
                <Text style={styles.editModalSubtitle}>
                  Keep your contact details & health baseline up to date
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsEditModalVisible(false)}
                style={styles.modalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#4A5952" />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollViewRef}
              style={styles.editModalBody}
              contentContainerStyle={{
                paddingBottom: keyboardHeight > 0 ? keyboardHeight + 80 : 40,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {/* Personal Details */}
              <Text style={styles.formSectionLabel}>PERSONAL & CONTACT</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>Surname</Text>
                <View style={styles.inputFieldBox}>
                  <Ionicons name="person-outline" size={18} color="#4A5952" style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputTextInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Enter your surname"
                    placeholderTextColor="#72857B"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>Phone Number</Text>
                <View style={styles.inputFieldBox}>
                  <Ionicons name="call-outline" size={18} color="#4A5952" style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputTextInput}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="+94 77 123 4567"
                    placeholderTextColor="#72857B"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Date of Birth Picker Button */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>Date of Birth</Text>
                <TouchableOpacity
                  style={styles.datePickerTriggerBox}
                  onPress={handleOpenDatePicker}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={18} color="#3B6E5C" style={styles.inputIcon} />
                  <Text style={editDob ? styles.datePickerTriggerValue : styles.datePickerPlaceholder}>
                    {editDob ? formatDob(editDob) : 'Select Date of Birth'}
                  </Text>
                  <View style={styles.datePickerChevronBadge}>
                    <Ionicons name="calendar" size={14} color="#3B6E5C" />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Guardian / Emergency Contact Form Section */}
              <Text style={[styles.formSectionLabel, { marginTop: 18 }]}>GUARDIAN & EMERGENCY CONTACT</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>Guardian / Contact Name</Text>
                <View style={styles.inputFieldBox}>
                  <Ionicons name="shield-outline" size={18} color="#4A5952" style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputTextInput}
                    value={editGuardianName}
                    onChangeText={setEditGuardianName}
                    placeholder="Enter guardian full name"
                    placeholderTextColor="#72857B"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>Relationship to Patient</Text>
                <View style={styles.relationChipsGrid}>
                  {RELATIONSHIP_OPTIONS.map((rel) => {
                    const isSelected = editGuardianRelation === rel;
                    return (
                      <TouchableOpacity
                        key={rel}
                        style={[styles.relationChip, isSelected && styles.relationChipSelected]}
                        onPress={() => setEditGuardianRelation(rel)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.relationChipText,
                            isSelected && styles.relationChipTextSelected,
                          ]}
                        >
                          {rel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>Guardian Phone Number</Text>
                <View style={styles.inputFieldBox}>
                  <Ionicons name="call-outline" size={18} color="#4A5952" style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputTextInput}
                    value={editGuardianPhone}
                    onChangeText={setEditGuardianPhone}
                    placeholder="e.g. 0771234567 or +94 77 123 4567"
                    placeholderTextColor="#72857B"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Blood Group Chips */}
              <Text style={[styles.formSectionLabel, { marginTop: 14 }]}>BLOOD TYPE</Text>
              <View style={styles.bloodChipsGrid}>
                {BLOOD_GROUPS.map((bg) => {
                  const isSelected = editBloodGroup === bg;
                  return (
                    <TouchableOpacity
                      key={bg}
                      style={[styles.bloodChip, isSelected && styles.bloodChipSelected]}
                      onPress={() => setEditBloodGroup(isSelected ? null : bg)}
                      activeOpacity={0.8}
                    >
                      <FontAwesome5
                        name="tint"
                        size={12}
                        color={isSelected ? '#FFFFFF' : '#C94A4A'}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={[
                          styles.bloodChipText,
                          isSelected && styles.bloodChipTextSelected,
                        ]}
                      >
                        {bg}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Physical Vitals - Height Stepper & Presets */}
              <Text style={[styles.formSectionLabel, { marginTop: 18 }]}>PHYSICAL VITALS</Text>

              {/* Height Selector */}
              <View style={styles.stepperContainer}>
                <View style={styles.stepperHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="human-male-height" size={18} color="#3B6E5C" style={{ marginRight: 6 }} />
                    <Text style={styles.inputFieldLabel}>Height</Text>
                  </View>
                  <Text style={styles.stepperCurrentUnitText}>Centimeters (cm)</Text>
                </View>

                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleStepHeight(-5)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stepperBtnText}>-5</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleStepHeight(-1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={18} color="#3B6E5C" />
                  </TouchableOpacity>

                  <View style={styles.stepperValueContainer}>
                    <TextInput
                      style={styles.stepperValueInput}
                      value={editHeight}
                      onChangeText={setEditHeight}
                      placeholder="170"
                      placeholderTextColor="#72857B"
                      keyboardType="numeric"
                      textAlign="center"
                    />
                    <Text style={styles.stepperValueUnit}>cm</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleStepHeight(1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={18} color="#3B6E5C" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleStepHeight(5)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stepperBtnText}>+5</Text>
                  </TouchableOpacity>
                </View>

                {/* Quick Height Preset Chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetsChipRow}
                >
                  {HEIGHT_PRESETS.map((hVal) => {
                    const isSelected = parseFloat(editHeight) === hVal;
                    return (
                      <TouchableOpacity
                        key={hVal}
                        style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                        onPress={() => setEditHeight(String(hVal))}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.presetChipText, isSelected && styles.presetChipTextSelected]}>
                          {hVal} cm
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Weight Selector */}
              <View style={[styles.stepperContainer, { marginTop: 14 }]}>
                <View style={styles.stepperHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="scale-bathroom" size={18} color="#3B6E5C" style={{ marginRight: 6 }} />
                    <Text style={styles.inputFieldLabel}>Weight</Text>
                  </View>
                  <Text style={styles.stepperCurrentUnitText}>Kilograms (kg)</Text>
                </View>

                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleStepWeight(-5)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stepperBtnText}>-5</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleStepWeight(-1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={18} color="#3B6E5C" />
                  </TouchableOpacity>

                  <View style={styles.stepperValueContainer}>
                    <TextInput
                      style={styles.stepperValueInput}
                      value={editWeight}
                      onChangeText={setEditWeight}
                      placeholder="65"
                      placeholderTextColor="#72857B"
                      keyboardType="numeric"
                      textAlign="center"
                    />
                    <Text style={styles.stepperValueUnit}>kg</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleStepWeight(1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={18} color="#3B6E5C" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleStepWeight(5)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stepperBtnText}>+5</Text>
                  </TouchableOpacity>
                </View>

                {/* Quick Weight Preset Chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetsChipRow}
                >
                  {WEIGHT_PRESETS.map((wVal) => {
                    const isSelected = parseFloat(editWeight) === wVal;
                    return (
                      <TouchableOpacity
                        key={wVal}
                        style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                        onPress={() => setEditWeight(String(wVal))}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.presetChipText, isSelected && styles.presetChipTextSelected]}>
                          {wVal} kg
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* BMI Live Preview */}
              {modalLiveBmi !== null && (
                <View style={styles.modalBmiPreviewBox}>
                  <MaterialCommunityIcons name="speedometer" size={16} color="#3B6E5C" style={{ marginRight: 6 }} />
                  <Text style={styles.modalBmiPreviewText}>
                    Calculated BMI: <Text style={{ fontWeight: '800' }}>{modalLiveBmi}</Text>
                  </Text>
                </View>
              )}

              {/* Medical Information */}
              <Text style={[styles.formSectionLabel, { marginTop: 18 }]}>MEDICAL BASELINE</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>Known Allergies (Comma separated)</Text>
                <View style={[styles.inputFieldBox, { alignItems: 'flex-start', paddingTop: 10 }]}>
                  <MaterialCommunityIcons
                    name="shield-alert-outline"
                    size={18}
                    color="#4A5952"
                    style={[styles.inputIcon, { marginTop: 2 }]}
                  />
                  <TextInput
                    style={[styles.inputTextInput, { height: 60, textAlignVertical: 'top' }]}
                    value={editAllergies}
                    onChangeText={setEditAllergies}
                    placeholder="e.g. Penicillin, Peanuts, Seafood"
                    placeholderTextColor="#72857B"
                    multiline
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 150);
                    }}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>Special Medical Notes & Conditions</Text>
                <View style={[styles.inputFieldBox, { alignItems: 'flex-start', paddingTop: 10 }]}>
                  <MaterialCommunityIcons
                    name="clipboard-pulse-outline"
                    size={18}
                    color="#4A5952"
                    style={[styles.inputIcon, { marginTop: 2 }]}
                  />
                  <TextInput
                    style={[styles.inputTextInput, { height: 75, textAlignVertical: 'top' }]}
                    value={editSpecialNotes}
                    onChangeText={setEditSpecialNotes}
                    placeholder="Chronic conditions, regular medications, or surgical history..."
                    placeholderTextColor="#72857B"
                    multiline
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 150);
                    }}
                  />
                </View>
              </View>

              {/* Modal Buttons */}
              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setIsEditModalVisible(false)}
                  disabled={isSavingProfile}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSaveProfile}
                  disabled={isSavingProfile}
                  activeOpacity={0.8}
                >
                  {isSavingProfile ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.modalSaveBtnText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL 3: PURE REACT NATIVE INTERACTIVE DATE PICKER ── */}
      <Modal
        visible={isDatePickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.datePickerModalContent}>
            {/* Header: Month & Year Selector */}
            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                style={styles.calendarNavBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={20} color="#3B6E5C" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.calendarMonthYearTitleBtn}
                onPress={() => setIsYearPickerMode(!isYearPickerMode)}
                activeOpacity={0.7}
              >
                <Text style={styles.calendarMonthYearTitle}>
                  {MONTH_NAMES[pickerMonth]} {pickerYear}
                </Text>
                <Ionicons
                  name={isYearPickerMode ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#3B6E5C"
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNextMonth}
                style={styles.calendarNavBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-forward" size={20} color="#3B6E5C" />
              </TouchableOpacity>
            </View>

            {/* Quick Year Selection Grid Mode */}
            {isYearPickerMode ? (
              <View style={styles.yearPickerContainer}>
                <Text style={styles.yearPickerHeading}>Select Birth Year</Text>
                <ScrollView
                  style={{ maxHeight: 240 }}
                  contentContainerStyle={styles.yearGridContent}
                  showsVerticalScrollIndicator={true}
                >
                  {availableYears.map((yr) => {
                    const isSelected = yr === pickerYear;
                    return (
                      <TouchableOpacity
                        key={yr}
                        style={[styles.yearGridItem, isSelected && styles.yearGridItemSelected]}
                        onPress={() => {
                          setPickerYear(yr);
                          setIsYearPickerMode(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.yearGridItemText,
                            isSelected && styles.yearGridItemTextSelected,
                          ]}
                        >
                          {yr}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              /* Standard Calendar Day Grid */
              <View style={styles.calendarGridContainer}>
                {/* Days of Week Row */}
                <View style={styles.calendarWeekRow}>
                  {DAYS_OF_WEEK.map((dow, idx) => (
                    <Text key={idx} style={styles.calendarWeekDayLabel}>
                      {dow}
                    </Text>
                  ))}
                </View>

                {/* Days Cells */}
                <View style={styles.calendarDaysGrid}>
                  {/* Empty slots for days before 1st of month */}
                  {Array.from({ length: calendarDays.firstDayIndex }).map((_, idx) => (
                    <View key={`empty-${idx}`} style={styles.calendarDayCell} />
                  ))}

                  {/* Days of the month */}
                  {Array.from({ length: calendarDays.daysInCurrentMonth }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const isSelected = dayNum === pickerDay;
                    return (
                      <TouchableOpacity
                        key={`day-${dayNum}`}
                        style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected]}
                        onPress={() => setPickerDay(dayNum)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.calendarDayCellText,
                            isSelected && styles.calendarDayCellTextSelected,
                          ]}
                        >
                          {dayNum}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Selected Date Summary & Confirm/Cancel */}
            <View style={styles.datePickerFooter}>
              <View style={styles.datePickerSelectedBadge}>
                <Ionicons name="calendar-outline" size={15} color="#3B6E5C" style={{ marginRight: 6 }} />
                <Text style={styles.datePickerSelectedText}>
                  {pickerDay} {MONTH_NAMES[pickerMonth]} {pickerYear}
                </Text>
              </View>

              <View style={styles.datePickerFooterBtns}>
                <TouchableOpacity
                  style={styles.datePickerCancelBtn}
                  onPress={() => setIsDatePickerVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.datePickerCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.datePickerConfirmBtn}
                  onPress={handleConfirmDatePicker}
                  activeOpacity={0.8}
                >
                  <Text style={styles.datePickerConfirmBtnText}>Confirm Date</Text>
                </TouchableOpacity>
              </View>
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
    backgroundColor: '#D5E6DC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#D5E6DC',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    color: '#16211C',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: '#4A5952',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  editProfileHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B6E5C',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#3B6E5C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  editProfileHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    backgroundColor: '#EAF3ED',
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // ── Identity Card Styles ──
  identityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCECE2',
    shadowColor: '#16211C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 18,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: '#3B6E5C',
    padding: 2.5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#1B5E4B',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  avatarImage: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#1B5E4B',
  },
  avatarInitialCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#1B5E4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitialText: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22, 33, 28, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 52,
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#3B6E5C',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  identityDetails: {
    alignItems: 'center',
    width: '100%',
  },
  patientFullName: {
    color: '#16211C',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  patientUsername: {
    color: '#4A5952',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  roleBadgeContainer: {
    marginTop: 8,
    marginBottom: 14,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: 12,
  },
  studentBadge: {
    backgroundColor: '#E8F5E9',
  },
  studentBadgeText: {
    color: '#2E7D32',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  staffBadge: {
    backgroundColor: '#E3F1F8',
  },
  staffBadgeText: {
    color: '#1976D2',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  generalBadge: {
    backgroundColor: '#EAF3ED',
  },
  generalBadgeText: {
    color: '#3B6E5C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── Meta Info Table ──
  metaInfoTable: {
    width: '100%',
    backgroundColor: '#F7FAF8',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2EEE6',
  },
  metaInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#EAF3ED',
  },
  metaIconCol: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  metaLabel: {
    color: '#4A5952',
    fontSize: 12,
    fontWeight: '600',
    width: 95,
  },
  metaValue: {
    flex: 1,
    color: '#16211C',
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'right',
  },

  // ── Section Header ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionHeading: {
    color: '#16211C',
    fontSize: 15,
    fontWeight: '800',
  },
  sectionActionText: {
    color: '#3B6E5C',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // ── Vitals Grid ──
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  vitalCard: {
    width: (SCREEN_WIDTH - 32 - 12) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCECE2',
    marginBottom: 12,
    shadowColor: '#16211C',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1.5,
  },
  vitalIconPill: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  vitalLabel: {
    color: '#4A5952',
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  vitalValue: {
    color: '#16211C',
    fontSize: 16.5,
    fontWeight: '800',
    marginBottom: 4,
  },
  vitalSub: {
    color: '#72857B',
    fontSize: 10.5,
    fontWeight: '500',
  },
  bmiPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  bmiPillText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Full-width DOB Card
  dobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCECE2',
    marginBottom: 18,
    shadowColor: '#16211C',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1.5,
  },
  dobValueText: {
    color: '#16211C',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  agePill: {
    backgroundColor: '#E8F3F8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agePillText: {
    color: '#3B85A6',
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Clinical Cards ──
  clinicalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCECE2',
    marginBottom: 14,
    shadowColor: '#16211C',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1.5,
  },
  clinicalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  clinicalIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  clinicalCardTitle: {
    color: '#16211C',
    fontSize: 13.5,
    fontWeight: '800',
  },
  clinicalCardSubtitle: {
    color: '#72857B',
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 1,
  },
  allergyTagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  allergyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDF0ED',
    borderWidth: 1,
    borderColor: '#FBD8D1',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  allergyPillText: {
    color: '#C94A4A',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyClinicalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  emptyClinicalText: {
    color: '#4A5952',
    fontSize: 12,
    fontWeight: '500',
  },
  specialNotesText: {
    color: '#16211C',
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
    backgroundColor: '#F7FAF8',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EEE6',
  },
  verifiedFooterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
  },
  verifiedFooterText: {
    flex: 1,
    color: '#4A5952',
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 14,
  },

  // ── Quick Navigation Menu Card ──
  navigationMenuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#DCECE2',
    shadowColor: '#16211C',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1.5,
    marginBottom: 10,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  navTextCol: {
    flex: 1,
  },
  navTitle: {
    color: '#16211C',
    fontSize: 13.5,
    fontWeight: '700',
  },
  navSub: {
    color: '#72857B',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  navDivider: {
    height: 1,
    backgroundColor: '#F0F5F2',
    marginLeft: 64,
  },

  // ── Modal Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(22, 33, 28, 0.55)',
    justifyContent: 'flex-end',
  },
  photoSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  photoSheetIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#D1E3D8',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  photoSheetTitle: {
    color: '#16211C',
    fontSize: 16.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  photoSheetSub: {
    color: '#72857B',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  photoSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5F2',
  },
  photoOptionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  photoSheetOptionTitle: {
    color: '#16211C',
    fontSize: 14,
    fontWeight: '700',
  },
  photoSheetOptionSub: {
    color: '#72857B',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
  },
  photoSheetCancel: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F9F6',
    borderRadius: 12,
  },
  photoSheetCancelText: {
    color: '#4A5952',
    fontSize: 13.5,
    fontWeight: '700',
  },

  // ── Edit Profile Modal Container ──
  editModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '90%',
    paddingTop: 16,
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5F2',
  },
  editModalTitle: {
    color: '#16211C',
    fontSize: 17,
    fontWeight: '800',
  },
  editModalSubtitle: {
    color: '#72857B',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalBody: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  formSectionLabel: {
    color: '#3B6E5C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputFieldLabel: {
    color: '#16211C',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 5,
  },
  inputFieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAF8',
    borderWidth: 1.2,
    borderColor: '#DCECE2',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputTextInput: {
    flex: 1,
    paddingVertical: 10,
    color: '#16211C',
    fontSize: 13.5,
    fontWeight: '600',
  },

  // ── Date Picker Trigger Box in Edit Modal ──
  datePickerTriggerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAF8',
    borderWidth: 1.2,
    borderColor: '#DCECE2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  datePickerTriggerValue: {
    flex: 1,
    color: '#16211C',
    fontSize: 13.5,
    fontWeight: '700',
  },
  datePickerPlaceholder: {
    flex: 1,
    color: '#72857B',
    fontSize: 13.5,
    fontWeight: '500',
  },
  datePickerChevronBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E8F3EE',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Blood Chips Grid ──
  bloodChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  bloodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAF8',
    borderWidth: 1.2,
    borderColor: '#DCECE2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bloodChipSelected: {
    backgroundColor: '#3B6E5C',
    borderColor: '#3B6E5C',
  },
  bloodChipText: {
    color: '#16211C',
    fontSize: 12.5,
    fontWeight: '700',
  },
  bloodChipTextSelected: {
    color: '#FFFFFF',
  },

  // ── Stepper Controls for Height & Weight ──
  stepperContainer: {
    backgroundColor: '#F7FAF8',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#DCECE2',
  },
  stepperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepperCurrentUnitText: {
    color: '#72857B',
    fontSize: 11,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E8F3EE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D5E6DC',
  },
  stepperBtnText: {
    color: '#3B6E5C',
    fontSize: 12.5,
    fontWeight: '800',
  },
  stepperValueContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DCECE2',
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 8,
  },
  stepperValueInput: {
    color: '#16211C',
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: 4,
    minWidth: 45,
  },
  stepperValueUnit: {
    color: '#72857B',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 3,
  },
  presetsChipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingVertical: 2,
  },
  presetChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5E6DC',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  presetChipSelected: {
    backgroundColor: '#3B6E5C',
    borderColor: '#3B6E5C',
  },
  presetChipText: {
    color: '#4A5952',
    fontSize: 11,
    fontWeight: '700',
  },
  presetChipTextSelected: {
    color: '#FFFFFF',
  },

  modalBmiPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  modalBmiPreviewText: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '600',
  },

  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F3',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    color: '#4A5952',
    fontSize: 14,
    fontWeight: '700',
  },
  modalSaveBtn: {
    flex: 1.6,
    flexDirection: 'row',
    backgroundColor: '#3B6E5C',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B6E5C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // ── Date Picker Modal Styles ──
  datePickerModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    width: '100%',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAF3ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthYearTitleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F1F6F3',
    borderRadius: 12,
  },
  calendarMonthYearTitle: {
    color: '#16211C',
    fontSize: 15.5,
    fontWeight: '800',
  },
  yearPickerContainer: {
    paddingVertical: 8,
  },
  yearPickerHeading: {
    color: '#3B6E5C',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 10,
    textAlign: 'center',
  },
  yearGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 10,
  },
  yearGridItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F5F9F6',
    borderWidth: 1,
    borderColor: '#DCECE2',
  },
  yearGridItemSelected: {
    backgroundColor: '#3B6E5C',
    borderColor: '#3B6E5C',
  },
  yearGridItemText: {
    color: '#16211C',
    fontSize: 13.5,
    fontWeight: '700',
  },
  yearGridItemTextSelected: {
    color: '#FFFFFF',
  },
  calendarGridContainer: {
    paddingVertical: 4,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calendarWeekDayLabel: {
    width: (SCREEN_WIDTH - 36 - 12) / 7,
    textAlign: 'center',
    color: '#72857B',
    fontSize: 12,
    fontWeight: '700',
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  calendarDayCell: {
    width: (SCREEN_WIDTH - 36) / 7,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    borderRadius: 19,
  },
  calendarDayCellSelected: {
    backgroundColor: '#3B6E5C',
  },
  calendarDayCellText: {
    color: '#16211C',
    fontSize: 13.5,
    fontWeight: '600',
  },
  calendarDayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  datePickerFooter: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
    paddingTop: 12,
  },
  datePickerSelectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3ED',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'center',
    marginBottom: 12,
  },
  datePickerSelectedText: {
    color: '#3B6E5C',
    fontSize: 13,
    fontWeight: '800',
  },
  datePickerFooterBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  datePickerCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F3',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerCancelBtnText: {
    color: '#4A5952',
    fontSize: 13.5,
    fontWeight: '700',
  },
  datePickerConfirmBtn: {
    flex: 1.6,
    backgroundColor: '#3B6E5C',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },

  // ── Guardian / Emergency Contact Card ──
  guardianCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCECE2',
    marginBottom: 16,
    shadowColor: '#1B5E4B',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  guardianCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guardianCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  guardianIconPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E6F4EE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBE5D9',
  },
  guardianNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  guardianNameText: {
    color: '#16211C',
    fontSize: 15,
    fontWeight: '800',
  },
  guardianRelationBadge: {
    backgroundColor: '#EAF3ED',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#D2E5DB',
  },
  guardianRelationBadgeText: {
    color: '#1B5E4B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  guardianPhoneText: {
    color: '#4A5952',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  guardianCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B5E4B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#1B5E4B',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 2,
  },
  guardianCallButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyGuardianCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  emptyGuardianIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F7F4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8E8DF',
  },
  emptyGuardianTitle: {
    color: '#16211C',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyGuardianSubtitle: {
    color: '#72857B',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  emptyGuardianAddBadge: {
    backgroundColor: '#3B6E5C',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  emptyGuardianAddBadgeText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // ── Relationship Selector Chips in Modal ──
  relationChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  relationChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F3',
    borderWidth: 1,
    borderColor: '#DCE7E1',
  },
  relationChipSelected: {
    backgroundColor: '#1B5E4B',
    borderColor: '#1B5E4B',
  },
  relationChipText: {
    color: '#4A5952',
    fontSize: 12.5,
    fontWeight: '600',
  },
  relationChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
