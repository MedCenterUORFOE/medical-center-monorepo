"use client";

import { useState } from "react";
import type { Appointment, Drug, MedicalReport, Prescription, Student } from "./types";

const initialStudents: Student[] = [
  { id: "s1", studentId: "STU-1001", name: "Aisha Khan", age: 20, gender: "Female", bloodGroup: "O+", phone: "555-0101", email: "aisha@uni.edu", allergies: "Penicillin", conditions: "Asthma", notes: "Uses inhaler" },
  { id: "s2", studentId: "STU-1002", name: "Liam Patel", age: 22, gender: "Male", bloodGroup: "A+", phone: "555-0102", email: "liam@uni.edu", allergies: "None", conditions: "None", notes: "" },
  { id: "s3", studentId: "STU-1003", name: "Sofia Garcia", age: 19, gender: "Female", bloodGroup: "B-", phone: "555-0103", email: "sofia@uni.edu", allergies: "Peanuts", conditions: "Migraine", notes: "Carries EpiPen" },
  { id: "s4", studentId: "STU-1004", name: "Noah Williams", age: 21, gender: "Male", bloodGroup: "AB+", phone: "555-0104", email: "noah@uni.edu", allergies: "None", conditions: "Diabetes Type 1", notes: "Insulin dependent" },
  { id: "s5", studentId: "STU-1005", name: "Mia Chen", age: 23, gender: "Female", bloodGroup: "O-", phone: "555-0105", email: "mia@uni.edu", allergies: "Sulfa drugs", conditions: "None", notes: "" },
];

const today = new Date();
const fmt = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (days: number) => {
  const value = new Date(today);
  value.setDate(value.getDate() + days);
  return fmt(value);
};

const initialAppointments: Appointment[] = [
  { id: "a1", studentId: "STU-1001", studentName: "Aisha Khan", date: fmt(today), time: "09:00", doctor: "Dr. Smith", reason: "Asthma follow-up", status: "Scheduled" },
  { id: "a2", studentId: "STU-1002", studentName: "Liam Patel", date: fmt(today), time: "10:30", doctor: "Dr. Adams", reason: "Routine check-up", status: "Scheduled" },
  { id: "a3", studentId: "STU-1003", studentName: "Sofia Garcia", date: addDays(1), time: "11:00", doctor: "Dr. Smith", reason: "Migraine consultation", status: "Scheduled" },
  { id: "a4", studentId: "STU-1004", studentName: "Noah Williams", date: addDays(-1), time: "14:00", doctor: "Dr. Lee", reason: "Diabetes review", status: "Completed" },
  { id: "a5", studentId: "STU-1005", studentName: "Mia Chen", date: addDays(-2), time: "15:30", doctor: "Dr. Adams", reason: "Cold symptoms", status: "Completed" },
  { id: "a6", studentId: "STU-1001", studentName: "Aisha Khan", date: addDays(3), time: "09:30", doctor: "Dr. Smith", reason: "Inhaler refill", status: "Scheduled" },
];

const initialDrugs: Drug[] = [
  { id: "d1", name: "Paracetamol 500mg", category: "Analgesic", stock: 240, unit: "tablets", expiryDate: addDays(180), reorderLevel: 100 },
  { id: "d2", name: "Amoxicillin 250mg", category: "Antibiotic", stock: 35, unit: "capsules", expiryDate: addDays(60), reorderLevel: 50 },
  { id: "d3", name: "Salbutamol Inhaler", category: "Bronchodilator", stock: 12, unit: "units", expiryDate: addDays(20), reorderLevel: 10 },
  { id: "d4", name: "Ibuprofen 400mg", category: "Analgesic", stock: 180, unit: "tablets", expiryDate: addDays(300), reorderLevel: 80 },
  { id: "d5", name: "Cetirizine 10mg", category: "Antihistamine", stock: 18, unit: "tablets", expiryDate: addDays(15), reorderLevel: 40 },
  { id: "d6", name: "Insulin Glargine", category: "Hormone", stock: 8, unit: "vials", expiryDate: addDays(45), reorderLevel: 5 },
  { id: "d7", name: "Loratadine 10mg", category: "Antihistamine", stock: 90, unit: "tablets", expiryDate: addDays(-5), reorderLevel: 30 },
  { id: "d8", name: "ORS Sachets", category: "Electrolyte", stock: 60, unit: "sachets", expiryDate: addDays(220), reorderLevel: 25 },
];

const initialPrescriptions: Prescription[] = [
  { id: "p1", studentId: "STU-1004", studentName: "Noah Williams", date: addDays(-1), doctor: "Dr. Lee", diagnosis: "Type 1 Diabetes - stable", items: [{ drug: "Insulin Glargine", dosage: "20 units nightly", duration: "30 days" }] },
  { id: "p2", studentId: "STU-1005", studentName: "Mia Chen", date: addDays(-2), doctor: "Dr. Adams", diagnosis: "Common cold", items: [{ drug: "Paracetamol 500mg", dosage: "1 tab every 6h", duration: "5 days" }, { drug: "Cetirizine 10mg", dosage: "1 tab daily", duration: "5 days" }], },
];

const initialReports: MedicalReport[] = [
  { id: "r1", studentId: "STU-1001", studentName: "Aisha Khan", date: addDays(-7), doctor: "Dr. Smith", title: "Asthma Assessment", findings: "Mild persistent asthma. Lung function 85% of predicted.", recommendations: "Continue inhaler. Avoid known triggers. Follow-up in 4 weeks." },
  { id: "r2", studentId: "STU-1004", studentName: "Noah Williams", date: addDays(-1), doctor: "Dr. Lee", title: "Diabetes Quarterly Review", findings: "HbA1c 7.1%. Glucose well controlled.", recommendations: "Maintain current insulin regimen. Continue diet plan." },
];

export function useDataStore() {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [drugs, setDrugs] = useState<Drug[]>(initialDrugs);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(initialPrescriptions);
  const [reports, setReports] = useState<MedicalReport[]>(initialReports);

  return {
    students,
    setStudents,
    appointments,
    setAppointments,
    drugs,
    setDrugs,
    prescriptions,
    setPrescriptions,
    reports,
    setReports,
  };
}

export type DataStore = ReturnType<typeof useDataStore>;

export function genId(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}