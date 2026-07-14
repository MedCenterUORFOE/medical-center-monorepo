'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, MapPin, Phone, Truck, CheckCircle2, Clock, Volume2, AlertTriangle, Key, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import api from '@/lib/axios';

interface Requester {
  name: string;
  phone: string | null;
}

interface Driver {
  user: {
    name: string;
    phone: string | null;
  }
}

interface EmergencyRequest {
  id: string;
  requester_id: string;
  driver_id: string | null;
  patient_location_lat: number;
  patient_location_lng: number;
  driver_location_lat: number | null;
  driver_location_lng: number | null;
  status: 'PENDING' | 'DISPATCHED' | 'ASSIGNED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
  requester: Requester;
  driver: Driver | null;
}

// Client-safe Supabase Realtime initializer
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseClient = createClient(supabaseUrl, supabaseKey);

export default function EmergencyDashboard() {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement>(null);
  
  // Data States
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Maps instances
  const googleMapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{ [key: string]: google.maps.Marker[] }>({});
  const polylineRef = useRef<{ [key: string]: google.maps.Polyline }>({});

  const playEmergencyChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const beep = (delay: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + delay); // A5 note
        gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.35, audioCtx.currentTime + delay + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + 0.4);
      };

      beep(0);
      beep(0.35);
    } catch (err) {
      console.error('Audio synthesis failed:', err);
    }
  };

  // Fetch initial active emergency requests
  const fetchEmergencyRequests = async () => {
    try {
      const response = await api.get('/ambulance/requests');
      if (response.data && response.data.success) {
        setRequests(response.data.data.requests || []);
      }
    } catch (err) {
      console.error('Failed to load emergency dispatches:', err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Initial Load and WebSocket Subscription
  useEffect(() => {
    fetchEmergencyRequests();

    // Subscribe to real-time changes on EmergencyRequest table
    const channel = supabaseClient
      .channel('emergency-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'EmergencyRequest' },
        (payload) => {
          console.log('Realtime emergency change:', payload);
          // Play warning audio chime if a new request is created
          if (payload.eventType === 'INSERT' && payload.new && payload.new.status === 'PENDING') {
            playEmergencyChime();
          }
          fetchEmergencyRequests();
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, []);

  // 2. Load Google Maps Script Dynamically
  useEffect(() => {
    if (window.google) {
      setMapLoaded(true);
      return;
    }

    const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!mapsKey) {
      console.error('Google Maps API Key is missing in client environment configuration.');
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);
  }, []);

  // 3. Initialize Map Container
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || googleMapInstance.current) return;

    // Centered on Matara (University of Ruhuna vicinity)
    googleMapInstance.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 5.9381, lng: 80.5761 },
      zoom: 14,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1a1f2c' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2c' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#747f8d' }] },
        { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
        { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#51b88e' }] },
        { featureType: 'road', stylers: [{ color: '#0f1422' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#273142' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#566376' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#090d16' }] }
      ]
    });
  }, [mapLoaded]);

  // 4. Draw Markers and Polylines whenever requests or map state updates
  useEffect(() => {
    if (!googleMapInstance.current || !window.google) return;

    const map = googleMapInstance.current;
    
    // Clear old markers/polylines
    Object.values(markersRef.current).forEach(markers => markers.forEach(m => m.setMap(null)));
    Object.values(polylineRef.current).forEach(poly => poly.setMap(null));
    
    markersRef.current = {};
    polylineRef.current = {};

    requests.forEach((req) => {
      const markers: google.maps.Marker[] = [];
      const patientPos = { lat: req.patient_location_lat, lng: req.patient_location_lng };

      // A. Patient pickup marker
      const isPending = req.status === 'PENDING';
      const patientIcon = {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: isPending ? '#ef4444' : '#f59e0b', // Red for pending, yellow for active
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 1.5,
        scale: 8
      };

      const patientMarker = new window.google.maps.Marker({
        position: patientPos,
        map,
        title: `Patient: ${req.requester.name}`,
        icon: patientIcon
      });

      // Add info window on click
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="color: #111827; font-family: sans-serif; font-size: 12px; padding: 4px;">
            <p><strong>Patient:</strong> ${req.requester.name}</p>
            <p><strong>Status:</strong> ${req.status}</p>
            <p><strong>Phone:</strong> ${req.requester.phone || 'N/A'}</p>
          </div>
        `
      });

      patientMarker.addListener('click', () => {
        infoWindow.open(map, patientMarker);
        setSelectedRequestId(req.id);
      });

      markers.push(patientMarker);

      // B. Driver current position (if available)
      if (req.driver_location_lat && req.driver_location_lng) {
        const driverPos = { lat: req.driver_location_lat, lng: req.driver_location_lng };

        const driverMarker = new window.google.maps.Marker({
          position: driverPos,
          map,
          title: `Ambulance: ${req.driver?.user.name || 'Driver'}`,
          icon: {
            path: 'M20,8H17V4H3C1.9,4,1,4.9,1,6V17H3A3,3,0,0,0,9,17H15A3,3,0,0,0,21,17H23V12L20,8M6,18.5A1.5,1.5,0,1,1,7.5,17A1.5,1.5,0,0,1,6,18.5M17,18.5A1.5,1.5,0,1,1,18.5,17A1.5,1.5,0,0,1,17,18.5',
            fillColor: '#3b82f6', // Blue for ambulance
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1,
            scale: 1,
            anchor: new window.google.maps.Point(12, 12)
          }
        });

        markers.push(driverMarker);

        // C. Route polyline connection
        const routePoly = new window.google.maps.Polyline({
          path: [driverPos, patientPos],
          geodesic: true,
          strokeColor: '#10b981', // Green line for routing
          strokeOpacity: 0.8,
          strokeWeight: 3,
          map
        });

        polylineRef.current[req.id] = routePoly;
      }

      markersRef.current[req.id] = markers;

      // Pan to selected request on click
      if (selectedRequestId === req.id) {
        map.panTo(patientPos);
      }
    });

  }, [requests, mapLoaded, selectedRequestId]);

  const handleSelectRequest = (req: EmergencyRequest) => {
    setSelectedRequestId(req.id);
    if (googleMapInstance.current) {
      googleMapInstance.current.panTo({
        lat: req.patient_location_lat,
        lng: req.patient_location_lng
      });
      googleMapInstance.current.setZoom(15);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
      case 'ASSIGNED':
      case 'DISPATCHED':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      case 'ARRIVED':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
      default:
        return 'bg-slate-500/10 border-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="bg-[#111827] border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-600 rounded-lg text-white animate-pulse">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="font-extrabold text-white text-lg tracking-wide">University Medical Center</h1>
            <p className="text-xs text-slate-500">Emergency Dispatch Command Center</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={playEmergencyChime}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center gap-2"
          >
            <Volume2 className="w-4 h-4" />
            <span>Simulate Alarm</span>
          </button>
          
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

      {/* Main Command Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side Pane: Active Emergency Requests Queue */}
        <aside className="w-96 border-r border-slate-800 bg-[#0f1422] p-5 flex flex-col gap-4 shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Dispatches</h3>
            <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
              {requests.length} Incidents
            </span>
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 py-12">
              <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
              <span className="text-xs">Loading incident feed...</span>
            </div>
          ) : requests.length > 0 ? (
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {requests.map((req) => (
                <button
                  key={req.id}
                  onClick={() => handleSelectRequest(req)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex flex-col gap-3 relative overflow-hidden ${
                    selectedRequestId === req.id
                      ? 'bg-slate-800/80 border-rose-500/40 shadow-lg shadow-rose-950/10'
                      : 'bg-[#151b2c] hover:bg-slate-800/40 border-slate-800'
                  }`}
                >
                  {/* Status Indicator Bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-amber-500" />

                  {/* Header Row */}
                  <div className="flex items-start justify-between w-full mt-1">
                    <div>
                      <span className="font-extrabold text-sm text-white truncate max-w-[190px] block">{req.requester.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">ID: {req.id.substring(0, 8)}</span>
                    </div>
                    <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-md border ${getStatusColor(req.status)}`}>
                      {req.status}
                    </span>
                  </div>

                  {/* Contact / Location Meta */}
                  <div className="space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{req.requester.phone || 'No phone recorded'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span className="font-mono text-[10px]">Lat: {req.patient_location_lat.toFixed(4)} | Lng: {req.patient_location_lng.toFixed(4)}</span>
                    </div>
                  </div>

                  {/* Driver / Dispatcher block */}
                  <div className="border-t border-slate-800/80 pt-2.5 mt-0.5">
                    {req.driver ? (
                      <div className="flex items-center justify-between text-xs text-slate-350 bg-slate-900/40 p-2 rounded-lg border border-slate-850">
                        <div className="flex items-center gap-2">
                          <Truck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-semibold truncate max-w-[120px]">{req.driver.user.name}</span>
                        </div>
                        {req.driver.user.phone && (
                          <a href={`tel:${req.driver.user.phone}`} className="text-slate-500 hover:text-emerald-400">
                            <Phone className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-rose-300 p-2 bg-rose-500/5 rounded-lg border border-rose-500/10 justify-center">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="font-bold tracking-wide">Awaiting Driver Dispatch</span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-600 text-xs flex flex-col items-center gap-2.5">
              <CheckCircle2 className="w-6 h-6 text-slate-750" />
              <span>No active emergency incidents reported.</span>
            </div>
          )}
        </aside>

        {/* Right Side Pane: Google Map Canvas */}
        <main className="flex-1 bg-[#090d16] relative overflow-hidden h-full">
          {!mapLoaded && (
            <div className="absolute inset-0 z-50 bg-[#090d16]/80 backdrop-blur flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
              <span className="text-sm font-semibold tracking-wide">Loading Dispatch Map System...</span>
            </div>
          )}
          
          <div ref={mapRef} className="w-full h-full" />
        </main>
      </div>
    </div>
  );
}
