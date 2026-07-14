export interface Student {
  id: string;
  studentId: string;
  name: string;
  age: number;
  gender: "Male" | "Female" | "Other";
  bloodGroup: string;
  phone: string;
  email: string;
  allergies: string;
  conditions: string;
  notes: string;
}

export interface Appointment {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  time: string;
  doctor: string;
  reason: string;
  status: "Scheduled" | "Completed" | "Cancelled";
}

export interface Drug {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  expiryDate: string;
  reorderLevel: number;
}

export interface Prescription {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  doctor: string;
  diagnosis: string;
  items: { drug: string; dosage: string; duration: string }[];
}

export interface MedicalReport {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  doctor: string;
  title: string;
  findings: string;
  recommendations: string;
}