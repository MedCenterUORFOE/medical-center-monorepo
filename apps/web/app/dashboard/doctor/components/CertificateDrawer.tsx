'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, FileText, Calendar, User, ShieldAlert, Loader2 } from 'lucide-react';
import api from '@/lib/axios';

interface CertificateRequest {
  id: string;
  patient_id: string;
  doctor_id: string;
  record_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  doctor_notes: string | null;
  patient: {
    user: {
      name: string;
      nic: string;
    }
  };
  record: {
    visit_date_time: string;
    diagnosis: string;
    symptoms: string;
  };
}

interface CertificateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onProcessed: () => void;
  inline?: boolean;
  onPendingCountChange?: (count: number) => void;
}

export default function CertificateDrawer({
  isOpen,
  onClose,
  onProcessed,
  inline = false,
  onPendingCountChange,
}: CertificateDrawerProps) {
  const [requests, setRequests] = useState<CertificateRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  
  // Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchPendingRequests = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await api.get('/certificates/request');
      if (response.data && response.data.success) {
        const nextRequests = response.data.data.requests || [];
        setRequests(nextRequests);
        onPendingCountChange?.(nextRequests.length);
      }
    } catch (err: any) {
      console.error('Error fetching certificates:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load certificate requests.');
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    fetchPendingRequests();
  }, [fetchPendingRequests, isOpen]);

  const handleUpdateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const doctorNotes = (notes[id] || '').trim();

    if (status === 'REJECTED' && !doctorNotes) {
      setErrorMsg('Doctor notes are strictly required when rejecting a medical certificate.');
      return;
    }

    setProcessingId(id);
    setProcessingMessage(status === 'APPROVED' ? 'Approving request...' : 'Rejecting request...');
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await api.patch(`/certificates/${id}/status`, {
        status,
        doctor_notes: doctorNotes || undefined
      });

      if (status === 'APPROVED') {
        setProcessingMessage('Generating PDF & sending emails...');

        try {
          const generateResponse = await api.post(`/certificates/${id}/generate`, {});
          setSuccessMsg(
            generateResponse.data.message || 'Certificate generated and dispatched successfully.'
          );
        } catch (err: any) {
          console.error('Error generating certificate:', err);
          setErrorMsg(
            err.response?.data?.message ||
              'Request was approved, but PDF generation or email dispatch failed. Please check the logs or retry.'
          );
          return;
        }
      } else {
        setSuccessMsg(response.data.message || 'Certificate request successfully rejected!');
      }
      
      // Clean notes for this request
      const updatedNotes = { ...notes };
      delete updatedNotes[id];
      setNotes(updatedNotes);

      // Refetch
      await fetchPendingRequests();
      onProcessed();
    } catch (err: any) {
      console.error('Error updating certificate:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to update certificate request status.');
    } finally {
      setProcessingId(null);
      setProcessingMessage(null);
    }
  };

  const handleNoteChange = (id: string, text: string) => {
    setNotes({
      ...notes,
      [id]: text
    });
  };

  if (!isOpen) return null;

  return (
    <div className={`${inline ? 'doctor-cert-workspace doctor-tab-workspace h-full p-6' : 'fixed inset-y-0 right-0 z-50 border-l'} doctor-certificate-panel w-full max-w-md flex flex-col overflow-hidden font-sans`}>
      {/* Header */}
      <div className="doctor-tab-header doctor-cert-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-400" />
          <h2 className="text-xl font-extrabold text-white">Certificate Requests</h2>
        </div>
        {!inline && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Drawer Body */}
      <div className="doctor-tab-body flex-1 overflow-y-auto space-y-5">
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4.5 h-4.5 shrink-0 text-rose-400 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-300 text-xs flex items-start gap-2">
            <CheckCircle className="w-4.5 h-4.5 shrink-0 text-emerald-400 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="text-xs">Loading certificate requests...</span>
          </div>
        ) : requests.length > 0 ? (
          <div className="space-y-4">
            {requests.map((req) => {
              const dateStr = new Date(req.record.visit_date_time).toLocaleDateString();
              
              return (
                <div key={req.id} className="doctor-certificate-card p-5 bg-[#111827] border border-slate-800 rounded-2xl shadow-xl space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                  
                  {/* Demographics */}
                  <div className="flex items-start gap-3 border-b border-slate-800 pb-3">
                    <div className="w-9 h-9 bg-[#151b2c] rounded-xl flex items-center justify-center text-emerald-400 shrink-0 border border-slate-700">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-white">{req.patient.user.name}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">NIC: {req.patient.user.nic} • Visit Date: {dateStr}</p>
                    </div>
                  </div>

                  {/* Visit Clinical Summary */}
                  <div className="doctor-certificate-summary bg-[#151b2c] p-4 rounded-xl space-y-3 border border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider mb-0.5">Symptoms</span>
                      <p className="text-slate-350 leading-relaxed font-mono">{req.record.symptoms}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider mb-0.5">Diagnosis</span>
                      <p className="text-slate-350 leading-relaxed font-semibold">{req.record.diagnosis}</p>
                    </div>
                  </div>

                  {/* Doctor Notes Input */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Practitioner Assessment Notes</label>
                    <textarea
                      value={notes[req.id] || ''}
                      onChange={(e) => handleNoteChange(req.id, e.target.value)}
                      placeholder="Input notes (strictly required for rejection)..."
                      rows={2}
                      className="doctor-certificate-input w-full px-3 py-2 bg-[#0b0f19] border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-white resize-none"
                    />
                  </div>

                  {/* Processing Actions */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {processingId === req.id && processingMessage && (
                      <div className="col-span-2 flex items-center justify-center gap-2 text-[10px] text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                        <span>{processingMessage}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={processingId === req.id}
                      onClick={() => handleUpdateStatus(req.id, 'REJECTED')}
                      className="py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>

                    <button
                      type="button"
                      disabled={processingId === req.id}
                      onClick={() => handleUpdateStatus(req.id, 'APPROVED')}
                      className="py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 text-xs shadow-lg shadow-emerald-950/15"
                    >
                      {processingId === req.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      <span>Approve MC</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 text-slate-500 text-xs flex flex-col items-center gap-2">
            <CheckCircle className="w-8 h-8 text-slate-750" />
            <span>No pending medical certificates.</span>
          </div>
        )}
      </div>
    </div>
  );
}
