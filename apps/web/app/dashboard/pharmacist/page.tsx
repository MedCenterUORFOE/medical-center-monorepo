'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, User, Calendar, Activity, CheckCircle2, ShieldAlert, Key, Plus, Trash2, Clock, History, AlertCircle, Loader2, Save, FileText, ArrowRight } from 'lucide-react';
import api from '@/lib/axios';

interface Batch {
  id: string;
  batch_number: string;
  stock_quantity: number;
  expiry_date: string;
}

interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medicine_id: string | null;
  medicine_name: string;
  dosage: string;
  quantity: number;
  instructions: string | null;
  source: 'INTERNAL' | 'EXTERNAL';
  dispensed_qty: number;
  remaining_qty: number;
  medicine: {
    id: string;
    name: string;
    unit: string;
    inventory_batches: Batch[];
  } | null;
}

interface Prescription {
  id: string;
  created_at: string;
  patient_name: string;
  patient_nic: string;
  doctor_name: string;
  items: PrescriptionItem[];
  is_active: boolean;
}

interface Allocation {
  inventory_batch_id: string;
  batch_number: string;
  quantity: number;
  available_stock: number;
}

export default function PharmacistDashboard() {
  const router = useRouter();

  // Feed States
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('session_token');
      if (token) {
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
          const payload = JSON.parse(atob(base64));
          setUserRole(payload.role || null);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  // Selected Prescription States
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(null);
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  
  // Selected Item to Dispense
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PrescriptionItem | null>(null);

  // Allocation Builder States
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [allocatedQty, setAllocatedQty] = useState('');

  // UI Feedback States
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  // Fetch active prescriptions on mount
  useEffect(() => {
    fetchPrescriptions();
  }, []);

  const fetchPrescriptions = async () => {
    setLoadingFeed(true);
    try {
      const response = await api.get('/prescriptions');
      if (response.data && response.data.success) {
        const activeFeed = response.data.data.prescriptions || [];
        setPrescriptions(activeFeed);
        
        // If a prescription is currently selected, refresh its details
        if (selectedPrescriptionId) {
          const refreshed = activeFeed.find((p: Prescription) => p.id === selectedPrescriptionId);
          if (refreshed) {
            setSelectedPrescription(refreshed);
            // Refresh selected item as well
            if (selectedItemId) {
              const itemRefreshed = refreshed.items.find((i: PrescriptionItem) => i.id === selectedItemId);
              if (itemRefreshed) {
                setSelectedItem(itemRefreshed);
              } else {
                setSelectedItemId(null);
                setSelectedItem(null);
              }
            }
          } else {
            setSelectedPrescriptionId(null);
            setSelectedPrescription(null);
            setSelectedItemId(null);
            setSelectedItem(null);
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching prescriptions:', err);
      showToast('error', 'Failed to retrieve active prescriptions queue.');
    } finally {
      setLoadingFeed(false);
    }
  };

  const handleSelectPrescription = (prescription: Prescription) => {
    setSelectedPrescriptionId(prescription.id);
    setSelectedPrescription(prescription);
    setSelectedItemId(null);
    setSelectedItem(null);
    setAllocations([]);
    setSelectedBatchId('');
    setAllocatedQty('');
  };

  const handleSelectItem = (item: PrescriptionItem) => {
    setSelectedItemId(item.id);
    setSelectedItem(item);
    setAllocations([]);
    setSelectedBatchId('');
    setAllocatedQty('');
  };

  // Add allocation row to our builder list (satisfying 7+3 logic splits)
  const handleAddAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !selectedBatchId || !allocatedQty) return;

    const qty = parseInt(allocatedQty);
    if (isNaN(qty) || qty <= 0) {
      showToast('error', 'Please enter a valid positive quantity.');
      return;
    }

    const batch = selectedItem.medicine?.inventory_batches.find(b => b.id === selectedBatchId);
    if (!batch) return;

    // A. Check if batch has enough stock
    if (qty > batch.stock_quantity) {
      showToast('error', `Insufficient stock in batch ${batch.batch_number} (Available: ${batch.stock_quantity}).`);
      return;
    }

    // B. Check if this batch is already allocated
    const alreadyAllocated = allocations.find(a => a.inventory_batch_id === selectedBatchId);
    if (alreadyAllocated) {
      showToast('error', `Batch ${batch.batch_number} is already added to allocations. Remove it to change quantity.`);
      return;
    }

    // C. Check if total allocations exceeds remaining requirement
    const currentAllocatedTotal = allocations.reduce((sum, a) => sum + a.quantity, 0);
    if (currentAllocatedTotal + qty > selectedItem.remaining_qty) {
      showToast('error', `Cannot allocate more than remaining requirement (${selectedItem.remaining_qty} required).`);
      return;
    }

    // Add to local allocations list
    setAllocations([
      ...allocations,
      {
        inventory_batch_id: selectedBatchId,
        batch_number: batch.batch_number,
        quantity: qty,
        available_stock: batch.stock_quantity
      }
    ]);

    // Reset inputs
    setSelectedBatchId('');
    setAllocatedQty('');
  };

  const handleRemoveAllocation = (index: number) => {
    const updated = [...allocations];
    updated.splice(index, 1);
    setAllocations(updated);
  };

  const handleExecuteDispensation = async () => {
    if (!selectedItemId || allocations.length === 0) return;

    setSubmitting(true);
    setToast(null);

    const payload = {
      prescription_item_id: selectedItemId,
      dispensations: allocations.map(a => ({
        inventory_batch_id: a.inventory_batch_id,
        quantity: a.quantity
      }))
    };

    try {
      await api.post('/dispensations/fulfill', payload);
      showToast('success', 'Stock deduction executed and prescription items dispensed!');
      
      // Reset allocation builder
      setAllocations([]);
      setSelectedBatchId('');
      setAllocatedQty('');
      
      // Refresh prescription data
      await fetchPrescriptions();
    } catch (err: any) {
      console.error('Dispensation error:', err);
      showToast('error', err.response?.data?.message || 'Failed to complete dispensation.');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate sum totals
  const totalAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0);
  const remainingRequirement = selectedItem ? selectedItem.remaining_qty - totalAllocated : 0;
  const isSatisfied = selectedItem ? totalAllocated === selectedItem.remaining_qty : false;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="bg-[#111827] border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500 rounded-lg text-white">
            <Pill className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-extrabold text-white text-lg tracking-wide">University Medical Center</h1>
            <p className="text-xs text-slate-500">Pharmacy Dispensation Hub</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {(userRole === 'NURSE' || userRole === 'ADMIN') && (
            <button
              onClick={() => router.push('/dashboard/nurse')}
              className="px-4 py-2 hover:bg-emerald-500/10 text-emerald-400 hover:text-emerald-350 text-xs font-bold rounded-lg border border-transparent hover:border-emerald-500/20 transition-all flex items-center gap-2"
            >
              <Activity className="w-4 h-4" />
              <span>Nurse Station</span>
            </button>
          )}

          <button
            onClick={() => {
              localStorage.removeItem('session_token');
              document.cookie = 'session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              router.push('/login');
            }}
            className="px-4 py-2 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 text-xs font-bold rounded-lg border border-transparent hover:border-rose-500/20 transition-all flex items-center gap-2"
          >
            <Key className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side Column: Awaiting Fulfillment Feed */}
        <aside className="w-80 border-r border-slate-800 bg-[#0f1422] p-5 flex flex-col gap-4 shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Awaiting Fulfillment</h3>
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
              {prescriptions.length} Active
            </span>
          </div>

          {loadingFeed ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 py-12">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <span className="text-xs">Loading queue...</span>
            </div>
          ) : prescriptions.length > 0 ? (
            <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
              {prescriptions.map((pres) => {
                const dateStr = new Date(pres.created_at).toLocaleDateString();
                const timeStr = new Date(pres.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                return (
                  <button
                    key={pres.id}
                    onClick={() => handleSelectPrescription(pres)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 relative overflow-hidden ${
                      selectedPrescriptionId === pres.id
                        ? 'bg-slate-800/80 border-emerald-500/40 shadow-md shadow-emerald-950/10'
                        : 'bg-[#151b2c] hover:bg-slate-800/40 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-xs text-white truncate max-w-[170px]">{pres.patient_name}</span>
                      <span className="text-[9px] text-emerald-400/90 font-mono">{timeStr}</span>
                    </div>

                    <div className="text-[10px] text-slate-500 space-y-0.5">
                      <p>NIC: {pres.patient_nic}</p>
                      <p>Dr. {pres.doctor_name}</p>
                    </div>

                    <div className="border-t border-slate-800/60 pt-1.5 mt-0.5 flex justify-between items-center text-[10px] text-slate-400">
                      <span>{dateStr}</span>
                      <span className="font-semibold text-emerald-500 flex items-center gap-1">
                        <span>Dispense</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-600 text-xs flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-slate-750" />
              <span>All prescriptions fulfilled!</span>
            </div>
          )}
        </aside>

        {/* Right Work Area: Detailed prescription view + Lot-by-lot deduction split */}
        <main className="flex-1 bg-[#0b0f19] p-6 overflow-hidden flex gap-6">
          {/* Floating Toast */}
          {toast && (
            <div
              className={`fixed top-20 right-6 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 border transition-all duration-300 transform translate-y-0 ${
                toast.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span className="text-xs font-semibold">{toast.message}</span>
            </div>
          )}

          {selectedPrescription ? (
            <div className="flex-1 flex gap-6 overflow-hidden">
              
              {/* Mid Pane: List of items in selected prescription */}
              <div className="w-1/2 flex flex-col gap-4 overflow-hidden h-full">
                {/* Patient / Prescriber Banner */}
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-xl shrink-0">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">Prescription Profile</h3>
                  <h2 className="text-lg font-extrabold text-white leading-tight">{selectedPrescription.patient_name}</h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-400">
                    <span>NIC: {selectedPrescription.patient_nic}</span>
                    <span className="text-slate-600">•</span>
                    <span>Dr. {selectedPrescription.doctor_name}</span>
                  </div>
                </div>

                {/* Items list */}
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col overflow-hidden">
                  <div className="border-b border-slate-800 pb-3 mb-3 shrink-0">
                    <h3 className="text-sm font-bold text-slate-200">Prescribed Medicine Items</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
                    {selectedPrescription.items.map((item) => {
                      const isFullyDispensed = item.remaining_qty === 0;
                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 rounded-xl border transition-all ${
                            item.source === 'EXTERNAL'
                              ? 'bg-slate-900/40 border-slate-850 opacity-60'
                              : selectedItemId === item.id
                              ? 'bg-[#1e293b]/70 border-emerald-500/40 shadow shadow-emerald-950/10'
                              : 'bg-[#151b2c] border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="text-xs font-bold text-white leading-snug">{item.medicine_name}</h4>
                              <p className="text-[10px] text-slate-500 mt-0.5">Dosage: {item.dosage}</p>
                              {item.instructions && (
                                <p className="text-[10px] text-slate-400 italic">"{item.instructions}"</p>
                              )}
                            </div>
                            
                            {item.source === 'EXTERNAL' ? (
                              <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                External
                              </span>
                            ) : isFullyDispensed ? (
                              <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                Fulfilled
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSelectItem(item)}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all border ${
                                  selectedItemId === item.id
                                    ? 'bg-emerald-500 text-white border-emerald-500'
                                    : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:bg-slate-750'
                                }`}
                              >
                                Dispense Lot
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] border-t border-slate-800/60 pt-2 text-slate-500">
                            <div>Required: <span className="font-bold text-slate-300">{item.quantity}</span></div>
                            <div>Dispensed: <span className="font-bold text-slate-300">{item.dispensed_qty}</span></div>
                            <div>Remaining: <span className={`font-bold ${item.remaining_qty > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{item.remaining_qty}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Pane: Lot-by-lot allocation grid */}
              <div className="w-1/2 bg-[#111827] border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl overflow-y-auto h-full flex flex-col">
                {selectedItem ? (
                  <div className="flex-1 flex flex-col min-h-0 space-y-5">
                    {/* Header */}
                    <div className="border-b border-slate-800 pb-3 shrink-0">
                      <h3 className="text-sm font-extrabold text-white">Physical Lot Extraction</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Medicine: <span className="text-slate-350 font-bold">{selectedItem.medicine_name}</span></p>
                    </div>

                    {/* Stock status split summary */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-[#151b2c] border border-slate-850 rounded-xl shrink-0 text-xs">
                      <div>
                        <span className="text-slate-500 block mb-0.5">Remaining Required</span>
                        <span className="text-lg font-black text-amber-400">{remainingRequirement} <span className="text-xs font-semibold text-slate-400">{selectedItem.medicine?.unit}</span></span>
                      </div>
                      <div>
                        <span className="text-slate-500 block mb-0.5">Drawn Allocation</span>
                        <span className="text-lg font-black text-emerald-400">{totalAllocated} <span className="text-xs font-semibold text-slate-400">{selectedItem.medicine?.unit}</span></span>
                      </div>
                    </div>

                    {/* Allocation list */}
                    <div className="flex-1 overflow-y-auto space-y-2">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Current Splits</h4>
                      
                      {allocations.length > 0 ? (
                        <div className="space-y-2">
                          {allocations.map((alloc, idx) => (
                            <div key={alloc.inventory_batch_id} className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-850 rounded-xl text-xs">
                              <div>
                                <span className="font-bold text-slate-300">Batch Code: </span>
                                <span className="text-white font-mono">{alloc.batch_number}</span>
                                <span className="text-[10px] text-slate-500 block">Drawn from {alloc.available_stock} available</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-emerald-400">{alloc.quantity} {selectedItem.medicine?.unit}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAllocation(idx)}
                                  className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-600 text-xs border border-dashed border-slate-800 rounded-xl">
                          No batches added yet. Allocate batches below.
                        </div>
                      )}
                    </div>

                    {/* Form Builder Grid */}
                    {!isSatisfied && (
                      <form onSubmit={handleAddAllocation} className="bg-slate-900/40 p-4 border border-slate-800 rounded-xl space-y-3 shrink-0">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Draw Batch Lot</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Batch selection */}
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Select Batch</label>
                            <select
                              value={selectedBatchId}
                              onChange={(e) => setSelectedBatchId(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-[#0b0f19] border border-slate-800 rounded-lg text-xs text-white"
                              required
                            >
                              <option value="">-- Choose Batch --</option>
                              {selectedItem.medicine?.inventory_batches.map((b) => (
                                <option key={b.id} value={b.id} disabled={b.stock_quantity <= 0}>
                                  {b.batch_number} (Avail: {b.stock_quantity} | Exp: {b.expiry_date})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Qty */}
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Quantity</label>
                            <div className="relative">
                              <input
                                type="number"
                                min="1"
                                value={allocatedQty}
                                onChange={(e) => setAllocatedQty(e.target.value)}
                                placeholder="e.g. 7"
                                className="w-full px-2.5 py-1.5 bg-[#0b0f19] border border-slate-800 rounded-lg text-xs text-white font-mono"
                                required
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-all border border-slate-700 flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Allocation Split</span>
                        </button>
                      </form>
                    )}

                    {/* Execute deduction section */}
                    <div className="border-t border-slate-800 pt-4 shrink-0">
                      {isSatisfied ? (
                        <div className="space-y-3">
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                            <span>Prescription requirements satisfied! Ready to write to ledger.</span>
                          </div>

                          <button
                            type="button"
                            onClick={handleExecuteDispensation}
                            disabled={submitting}
                            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs shadow-lg shadow-emerald-950/20 disabled:opacity-50"
                          >
                            {submitting ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Executing Stock Deduction...</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4" />
                                <span>Execute Final Stock Deduction</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-center text-slate-500 italic">
                          Please allocate the remaining {remainingRequirement} {selectedItem.medicine?.unit} to execute stock deduction.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3 text-center max-w-sm mx-auto h-full">
                    <div className="p-4 bg-slate-800/40 border border-slate-800 text-emerald-400 rounded-2xl shrink-0">
                      <Pill className="w-8 h-8" />
                    </div>
                    <h2 className="text-base font-bold text-white mt-2">No Active Medicine Selected</h2>
                    <p className="text-xs leading-relaxed">
                      Select a pending internal medicine item from the middle list and click "Dispense Lot" to open the physical batch allocation panel.
                    </p>
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3 text-center max-w-sm mx-auto h-full">
              <div className="p-4 bg-slate-800/40 border border-slate-800 text-emerald-400 rounded-2xl shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-white mt-2">No Prescription Loaded</h2>
              <p className="text-xs leading-relaxed">
                Select a prescription from the "Awaiting Fulfillment" queue on the left side feed to manage batch splits and execute stock deductions.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
