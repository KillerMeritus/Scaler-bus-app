import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, set, remove } from 'firebase/database';
import { firestore, auth, db } from '../firebase/config';
import { signOut } from 'firebase/auth';
import KebabMenu from '../components/ui/KebabMenu';
import Modal from '../components/ui/Modal';

// Haversine formula to calculate straight-line distance in km
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance in km
}

export default function AdminPanel() {
  const [tab, setTab] = useState('buses'); // 'buses' | 'routes' | 'users' | 'schedule'
  const [buses, setBuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [routes, setRoutes] = useState([]);

  // Route Form State
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [routeForm, setRouteForm] = useState({
    id: '', name: '',
    stop1Name: '', stop1Lat: '', stop1Lng: '', stop1Time: '',
    stop2Name: '', stop2Lat: '', stop2Lng: '', stop2Time: '',
  });

  // Modal states
  const [deleteModal, setDeleteModal] = useState({ open: false, type: '', id: '', name: '', tripIdx: null });
  const [editBusModal, setEditBusModal] = useState({ open: false, bus: null });
  const [editRouteModal, setEditRouteModal] = useState({ open: false, route: null });

  // Schedule tab states
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const [schedBusId, setSchedBusId] = useState('');
  const [schedTrips, setSchedTrips] = useState([]);
  const [schedBusName, setSchedBusName] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);

  // Edit form states
  const [editBusForm, setEditBusForm] = useState({ name: '', isActive: true });
  const [editRouteForm, setEditRouteForm] = useState({
    name: '',
    stop1Name: '', stop1Lat: '', stop1Lng: '', stop1Time: '',
    stop2Name: '', stop2Lat: '', stop2Lng: '', stop2Time: '',
  });

  useEffect(() => {
    loadData();
  }, [tab]);

  const loadData = async () => {
    // Load all data cross-referencing so dropdowns work in Buses tab
    const [busesSnap, usersSnap, routesSnap] = await Promise.all([
      getDocs(collection(firestore, 'buses')),
      getDocs(collection(firestore, 'users')),
      getDocs(collection(firestore, 'routes'))
    ]);
    setBuses(busesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setRoutes(routesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const updateUserRole = async (uid, role) => {
    await updateDoc(doc(firestore, 'users', uid), { role });
    loadData();
  };

  const assignBus = async (busId, updates) => {
    try {
      // 1. Optimistic UI update
      setBuses(prev => prev.map(b => b.id === busId ? { ...b, ...updates } : b));
      
      // 2. Update Firestore
      try {
        await updateDoc(doc(firestore, 'buses', busId), updates);
      } catch (e) {
        throw new Error("FIRESTORE_ERROR: " + e.message);
      }
      
      // 3. Mirror to RTDB
      try {
        const promises = Object.entries(updates).map(([key, val]) => {
           return set(ref(db, `buses/${busId}/${key}`), val);
        });
        await Promise.all(promises);
      } catch (e) {
        throw new Error("REALTIME_DB_ERROR: " + e.message);
      }
      
    } catch (e) {
      console.error("Assignment error:", e);
      alert(e.message + "\n\nPlease check your Firebase Security Rules!");
      loadData(); // Revert on failure
    }
  };

  const addBus = async () => {
    const name = prompt('Bus name (e.g. Bus A):');
    if (!name) return;
    const id = 'bus_' + Date.now();
    const busData = { name, isActive: true, defaultRoute: 'H1_H2', driverUid: '' };
    
    // Write to Firestore
    await setDoc(doc(firestore, 'buses', id), busData);
    
    // Mirror to Realtime Database so Student & Driver views can see it
    await set(ref(db, `buses/${id}`), {
      name,
      status: 'stopped',
      driverUid: '',
      route: '',
    });
    
    loadData();
  };

  // ──────────────── DELETE HANDLERS ────────────────

  const handleDeleteBus = async () => {
    const busId = deleteModal.id;
    try {
      await deleteDoc(doc(firestore, 'buses', busId));
      await remove(ref(db, `buses/${busId}`));
    } catch (e) {
      console.error('Delete bus error:', e);
      alert('Failed to delete bus: ' + e.message);
    }
    setDeleteModal({ open: false, type: '', id: '', name: '' });
    loadData();
  };

  const handleDeleteRoute = async () => {
    const routeId = deleteModal.id;
    try {
      await deleteDoc(doc(firestore, 'routes', routeId));
      // Also unassign this route from any bus that uses it
      const affectedBuses = buses.filter(b => b.route === routeId);
      for (const bus of affectedBuses) {
        await updateDoc(doc(firestore, 'buses', bus.id), { route: '', routeName: '' });
        await set(ref(db, `buses/${bus.id}/route`), '');
        await set(ref(db, `buses/${bus.id}/routeName`), '');
      }
    } catch (e) {
      console.error('Delete route error:', e);
      alert('Failed to delete route: ' + e.message);
    }
    setDeleteModal({ open: false, type: '', id: '', name: '', tripIdx: null });
    loadData();
  };

  const handleDeleteTrip = async () => {
    const tripIdx = deleteModal.tripIdx;
    const updatedTrips = schedTrips.filter((_, i) => i !== tripIdx);
    setSchedTrips(updatedTrips);
    try {
      await setDoc(doc(firestore, 'schedules', schedBusId), {
        busName: schedBusName,
        trips: updatedTrips,
        lastUpdated: new Date().toISOString()
      });
    } catch (e) {
      console.error('Delete trip error:', e);
      alert('Failed to delete trip: ' + e.message);
    }
    setDeleteModal({ open: false, type: '', id: '', name: '', tripIdx: null });
  };

  // ──────────────── EDIT HANDLERS ────────────────

  const openEditBus = (bus) => {
    setEditBusForm({ name: bus.name || '', isActive: bus.isActive ?? true });
    setEditBusModal({ open: true, bus });
  };

  const handleEditBus = async () => {
    const busId = editBusModal.bus.id;
    try {
      await updateDoc(doc(firestore, 'buses', busId), {
        name: editBusForm.name,
        isActive: editBusForm.isActive,
      });
      await set(ref(db, `buses/${busId}/name`), editBusForm.name);
    } catch (e) {
      console.error('Edit bus error:', e);
      alert('Failed to update bus: ' + e.message);
    }
    setEditBusModal({ open: false, bus: null });
    loadData();
  };

  const openEditRoute = (route) => {
    const s1 = route.stops?.[0] || {};
    const s2 = route.stops?.[1] || {};
    setEditRouteForm({
      name: route.name || '',
      stop1Name: s1.name || '', stop1Lat: s1.lat || '', stop1Lng: s1.lng || '', stop1Time: s1.scheduledTime || '',
      stop2Name: s2.name || '', stop2Lat: s2.lat || '', stop2Lng: s2.lng || '', stop2Time: s2.scheduledTime || '',
    });
    setEditRouteModal({ open: true, route });
  };

  const handleEditRoute = async () => {
    const routeId = editRouteModal.route.id;
    setCalculating(true);

    const straightLineKm = getDistanceFromLatLonInKm(
      Number(editRouteForm.stop1Lat), Number(editRouteForm.stop1Lng),
      Number(editRouteForm.stop2Lat), Number(editRouteForm.stop2Lng)
    );

    let correction_factor = editRouteModal.route.correction_factor || 1.3;

    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (token && editRouteForm.stop1Lat && editRouteForm.stop2Lat) {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${editRouteForm.stop1Lng},${editRouteForm.stop1Lat};${editRouteForm.stop2Lng},${editRouteForm.stop2Lat}?access_token=${token}`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const realRoadKm = data.routes[0].distance / 1000;
          correction_factor = realRoadKm / straightLineKm;
        }
      } catch (e) {
        console.error("Mapbox error on edit:", e);
      }
    }

    const stops = [
      { name: editRouteForm.stop1Name, lat: Number(editRouteForm.stop1Lat), lng: Number(editRouteForm.stop1Lng), scheduledTime: editRouteForm.stop1Time },
      { name: editRouteForm.stop2Name, lat: Number(editRouteForm.stop2Lat), lng: Number(editRouteForm.stop2Lng), scheduledTime: editRouteForm.stop2Time }
    ];

    try {
      await setDoc(doc(firestore, 'routes', routeId), {
        name: editRouteForm.name,
        stops,
        correction_factor
      });
    } catch (e) {
      console.error('Edit route error:', e);
      alert('Failed to update route: ' + e.message);
    }

    setCalculating(false);
    setEditRouteModal({ open: false, route: null });
    loadData();
  };

  // ──────────────── CREATE ROUTE (existing) ────────────────

  const handleSaveRoute = async () => {
    if (!routeForm.id || !routeForm.stop1Lat || !routeForm.stop2Lat) return alert("Fill required fields");
    setCalculating(true);
    
    // 1. Calculate straight line distance
    const straightLineKm = getDistanceFromLatLonInKm(
      Number(routeForm.stop1Lat), Number(routeForm.stop1Lng),
      Number(routeForm.stop2Lat), Number(routeForm.stop2Lng)
    );
    
    let correction_factor = 1.3; // Default safe fallback
    
    // 2. Fetch Mapbox Directions API for road distance
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (token) {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${routeForm.stop1Lng},${routeForm.stop1Lat};${routeForm.stop2Lng},${routeForm.stop2Lat}?access_token=${token}`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const realRoadMeters = data.routes[0].distance;
          const realRoadKm = realRoadMeters / 1000;
          
          // 3. Calculate dynamic Correction Factor!
          correction_factor = realRoadKm / straightLineKm;
        } else {
          alert("Mapbox API request failed. Using fallback correction factor.");
        }
      } catch (e) {
        console.error("Mapbox Route Error", e);
        alert("Network error. Using fallback correction factor.");
      }
    } else {
      alert("Warning: VITE_MAPBOX_TOKEN not found in .env. Using fallback correction factor of 1.3.");
    }
    
    // Save to Firestore with calculated factor
    const stops = [
      { name: routeForm.stop1Name, lat: Number(routeForm.stop1Lat), lng: Number(routeForm.stop1Lng), scheduledTime: routeForm.stop1Time },
      { name: routeForm.stop2Name, lat: Number(routeForm.stop2Lat), lng: Number(routeForm.stop2Lng), scheduledTime: routeForm.stop2Time }
    ];
    
    await setDoc(doc(firestore, 'routes', routeForm.id), {
      name: routeForm.name,
      stops: stops,
      correction_factor
    });
    
    setCalculating(false);
    setShowRouteForm(false);
    setRouteForm({
      id: '', name: '',
      stop1Name: '', stop1Lat: '', stop1Lng: '', stop1Time: '',
      stop2Name: '', stop2Lat: '', stop2Lng: '', stop2Time: '',
    });
    loadData();
  };

  // ──────────────── RENDER ────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-5 py-4 flex justify-between items-center">
        <h1 className="text-lg font-semibold">Admin Panel</h1>
        <button onClick={() => signOut(auth)} className="text-sm text-slate-400">Sign out</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-4 bg-white border-b border-slate-100">
        {['buses', 'routes', 'schedule', 'users'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* BUSES TAB */}
        {tab === 'buses' && (
          <>
            <button onClick={addBus} className="w-full py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl text-sm mb-4 hover:bg-white">
              + Add bus
            </button>
            {buses.map(bus => (
              <div key={bus.id} className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <p className="font-medium text-slate-800">{bus.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">ID: {bus.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${bus.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {bus.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <KebabMenu actions={[
                      { label: 'Edit', icon: '✏️', onClick: () => openEditBus(bus) },
                      { label: 'Delete', icon: '🗑️', onClick: () => setDeleteModal({ open: true, type: 'bus', id: bus.id, name: bus.name }), danger: true },
                    ]} />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mt-2 pt-3 border-t border-slate-100">
                  {/* Driver Assignment Dropdown */}
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Assigned Driver</label>
                    <select 
                       className="w-full text-sm border border-slate-200 rounded-lg p-1.5 bg-slate-50 focus:ring-blue-500 focus:border-blue-500"
                       value={bus.driverUid || ''}
                       onChange={(e) => assignBus(bus.id, { driverUid: e.target.value })}
                    >
                       <option value="">-- Unassigned --</option>
                       {users.filter(u => u.role === 'driver').map(d => (
                         <option key={d.id} value={d.id}>{d.displayName || d.email}</option>
                       ))}
                    </select>
                  </div>

                  {/* Route Assignment Dropdown */}
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Active Route</label>
                    <select 
                       className="w-full text-sm border border-slate-200 rounded-lg p-1.5 bg-slate-50 focus:ring-blue-500 focus:border-blue-500"
                       value={bus.route || ''}
                       onChange={(e) => {
                         const routeId = e.target.value;
                         const selectedRoute = routes.find(r => r.id === routeId);
                         assignBus(bus.id, { 
                           route: routeId,
                           routeName: selectedRoute ? selectedRoute.name : ''
                         });
                       }}
                    >
                       <option value="">-- Unassigned --</option>
                       {routes.map(r => (
                         <option key={r.id} value={r.id}>{r.name}</option>
                       ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* SCHEDULE TAB */}
        {tab === 'schedule' && (
          <div className="space-y-4">
            {/* Bus selector */}
            <div>
              <label className="text-xs text-slate-500 block mb-1 font-medium">Select Bus</label>
              <select
                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white focus:ring-blue-500 focus:border-blue-500"
                value={schedBusId}
                onChange={async (e) => {
                  const busId = e.target.value;
                  setSchedBusId(busId);
                  if (!busId) { setSchedTrips([]); setSchedBusName(''); return; }
                  const bus = buses.find(b => b.id === busId);
                  setSchedBusName(bus?.name || busId);
                  // Load existing schedule
                  try {
                    const schedDoc = await getDoc(doc(firestore, 'schedules', busId));
                    if (schedDoc.exists()) {
                      const data = schedDoc.data();
                      // Migration logic: if only 'stops' exists, wrap in a trip
                      if (data.stops && !data.trips) {
                        setSchedTrips([{
                          tripName: 'General Schedule',
                          stops: data.stops
                        }]);
                      } else {
                        setSchedTrips(data.trips || []);
                      }
                    } else {
                      // Pre-fill from route stops if available
                      const route = routes.find(r => r.id === bus?.route);
                      if (route?.stops) {
                        setSchedTrips([{
                          tripName: 'Trip 1',
                          stops: route.stops.map(s => ({
                            name: s.name,
                            times: { Mon: s.scheduledTime || '', Tue: s.scheduledTime || '', Wed: s.scheduledTime || '', Thu: s.scheduledTime || '', Fri: s.scheduledTime || '', Sat: '', Sun: '' }
                          }))
                        }]);
                      } else {
                        setSchedTrips([]);
                      }
                    }
                  } catch (err) {
                    console.error('Load schedule error:', err);
                    setSchedTrips([]);
                  }
                }}
              >
                <option value="">-- Select a bus --</option>
                {buses.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {schedBusId && (
              <div className="space-y-8">
                {/* Trips List */}
                {schedTrips.map((trip, tripIdx) => (
                  <div key={tripIdx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                      <div className="flex-1 max-w-xs">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Trip Name</label>
                        <input
                          value={trip.tripName}
                          onChange={(e) => {
                            const updated = [...schedTrips];
                            updated[tripIdx].tripName = e.target.value;
                            setSchedTrips(updated);
                          }}
                          className="bg-transparent font-semibold text-slate-700 focus:outline-none w-full border-b border-transparent focus:border-blue-300 transition"
                          placeholder="e.g., Morning Round"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          setDeleteModal({
                            open: true,
                            type: 'trip',
                            id: schedBusId,
                            name: trip.tripName || `Trip ${tripIdx + 1}`,
                            tripIdx: tripIdx
                          });
                        }}
                        className="text-xs text-red-400 hover:text-red-500 font-medium"
                      >
                        Delete Trip
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <div className="min-w-[600px]">
                        {/* Header row */}
                        <div className="grid border-b border-slate-100 bg-slate-50/50" style={{ gridTemplateColumns: '140px repeat(7, 1fr)' }}>
                          <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Stop</div>
                          {DAYS.map(d => (
                            <div key={d} className="px-1 py-2 text-[10px] font-bold text-slate-400 text-center uppercase">{d}</div>
                          ))}
                        </div>

                        {/* Stop rows */}
                        {(trip.stops || []).map((stop, stopIdx) => (
                          <div key={stopIdx} className="grid border-b border-slate-50 hover:bg-blue-50/30 transition" style={{ gridTemplateColumns: '140px repeat(7, 1fr)' }}>
                            <div className="px-3 py-2 flex items-center gap-2">
                              <input
                                value={stop.name}
                                onChange={(e) => {
                                  const updated = [...schedTrips];
                                  updated[tripIdx].stops[stopIdx].name = e.target.value;
                                  setSchedTrips(updated);
                                }}
                                className="w-full text-sm font-medium border-0 bg-transparent focus:outline-none text-slate-700 placeholder-slate-300"
                                placeholder="Stop name"
                              />
                            </div>
                            {DAYS.map(day => (
                              <div key={day} className="px-1 py-1.5 flex items-center justify-center">
                                <input
                                  type="time"
                                  value={stop.times?.[day] || ''}
                                  onChange={(e) => {
                                    const updated = [...schedTrips];
                                    updated[tripIdx].stops[stopIdx].times = { 
                                      ...updated[tripIdx].stops[stopIdx].times, 
                                      [day]: e.target.value 
                                    };
                                    setSchedTrips(updated);
                                  }}
                                  className="w-full text-xs border border-slate-200 rounded px-1 py-1 bg-white text-center focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50/30 flex gap-2">
                      <button
                        onClick={() => {
                          const updated = [...schedTrips];
                          updated[tripIdx].stops.push({
                            name: '',
                            times: { Mon: '', Tue: '', Wed: '', Thu: '', Fri: '', Sat: '', Sun: '' }
                          });
                          setSchedTrips(updated);
                        }}
                        className="flex-1 py-2 border border-slate-200 text-slate-500 rounded-xl text-xs font-medium hover:bg-white transition"
                      >
                        + Add Stop to Trip
                      </button>
                      {trip.stops?.length > 0 && (
                        <button
                          onClick={() => {
                            const updated = [...schedTrips];
                            updated[tripIdx].stops.pop();
                            setSchedTrips(updated);
                          }}
                          className="px-4 py-2 text-red-500 text-xs font-medium"
                        >
                          Remove Last Stop
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {schedTrips.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <p className="text-slate-400 text-sm">No trips configured for this bus.</p>
                  </div>
                )}

                {/* Global Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setSchedTrips([...schedTrips, {
                        tripName: `Trip ${schedTrips.length + 1}`,
                        stops: [{
                          name: '',
                          times: { Mon: '', Tue: '', Wed: '', Thu: '', Fri: '', Sat: '', Sun: '' }
                        }]
                      }]);
                    }}
                    className="flex-1 py-3 bg-white border border-blue-200 text-blue-600 rounded-xl text-sm font-semibold hover:bg-blue-50 transition shadow-sm"
                  >
                    + Add New Trip
                  </button>
                  
                  <button
                    onClick={async () => {
                      if (!schedBusId) return;
                      setSchedSaving(true);
                      try {
                        await setDoc(doc(firestore, 'schedules', schedBusId), {
                          busName: schedBusName,
                          trips: schedTrips,
                          lastUpdated: new Date().toISOString()
                        });
                        alert('All schedules saved!');
                      } catch (e) {
                        console.error('Save schedule error:', e);
                        alert('Failed to save: ' + e.message);
                      }
                      setSchedSaving(false);
                    }}
                    disabled={schedSaving}
                    className={`flex-[2] py-3 bg-blue-600 text-white rounded-xl text-sm font-bold transition shadow-md shadow-blue-100 ${schedSaving ? 'opacity-70' : 'hover:bg-blue-700'}`}
                  >
                    {schedSaving ? 'Saving Changes...' : 'Save All Trips'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* USERS TAB */}
        {tab === 'users' && (
          <>
            {users.map(user => (
              <div key={user.id} className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
                <p className="font-medium text-slate-800 text-sm">{user.displayName || user.email}</p>
                <p className="text-xs text-slate-400 mb-3">{user.email}</p>
                <div className="flex gap-2">
                  {['student', 'driver', 'committee'].map(role => (
                    <button key={role} onClick={() => updateUserRole(user.id, role)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition ${
                        user.role === role ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'
                      }`}>
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ROUTES TAB */}
        {tab === 'routes' && (
          <div className="space-y-3">
            {!showRouteForm ? (
              <button onClick={() => setShowRouteForm(true)} className="w-full py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl text-sm mb-4 hover:bg-white text-center transition">
                + Create new route & calculate ETA factor
              </button>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 text-sm mt-2 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-3 text-base">New Route & CTA Configurator</h3>
                <input placeholder="Route ID (e.g. H1_H2)" value={routeForm.id} onChange={e => setRouteForm({...routeForm, id: e.target.value})} className="w-full border border-slate-300 p-2 rounded-lg mb-2" />
                <input placeholder="Route Name (e.g. Hostel 1 → Hostel 2)" value={routeForm.name} onChange={e => setRouteForm({...routeForm, name: e.target.value})} className="w-full border border-slate-300 p-2 rounded-lg mb-4" />
                
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3">
                  <p className="font-medium text-slate-700 mb-2">Stop 1 (Departure)</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input placeholder="Stop Name" value={routeForm.stop1Name} onChange={e => setRouteForm({...routeForm, stop1Name: e.target.value})} className="w-full border p-2 rounded-md" />
                    <input placeholder="Ex: 07:30" value={routeForm.stop1Time} onChange={e => setRouteForm({...routeForm, stop1Time: e.target.value})} className="w-full border p-2 rounded-md" />
                    <input placeholder="Latitude" type="number" value={routeForm.stop1Lat} onChange={e => setRouteForm({...routeForm, stop1Lat: e.target.value})} className="w-full border p-2 rounded-md" />
                    <input placeholder="Longitude" type="number" value={routeForm.stop1Lng} onChange={e => setRouteForm({...routeForm, stop1Lng: e.target.value})} className="w-full border p-2 rounded-md" />
                  </div>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4">
                  <p className="font-medium text-slate-700 mb-2">Stop 2 (Destination)</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input placeholder="Stop Name" value={routeForm.stop2Name} onChange={e => setRouteForm({...routeForm, stop2Name: e.target.value})} className="w-full border p-2 rounded-md" />
                    <input placeholder="Ex: 08:00" value={routeForm.stop2Time} onChange={e => setRouteForm({...routeForm, stop2Time: e.target.value})} className="w-full border p-2 rounded-md" />
                    <input placeholder="Latitude" type="number" value={routeForm.stop2Lat} onChange={e => setRouteForm({...routeForm, stop2Lat: e.target.value})} className="w-full border p-2 rounded-md" />
                    <input placeholder="Longitude" type="number" value={routeForm.stop2Lng} onChange={e => setRouteForm({...routeForm, stop2Lng: e.target.value})} className="w-full border p-2 rounded-md" />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleSaveRoute} disabled={calculating} className={`flex-1 bg-blue-600 text-white rounded-lg py-2.5 font-medium transition ${calculating ? 'opacity-70' : 'hover:bg-blue-700'}`}>
                    {calculating ? 'Calculating Mapbox API...' : 'Save & Calculate'}
                  </button>
                  <button onClick={() => setShowRouteForm(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 rounded-lg py-2.5 hover:bg-slate-50 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {routes.map(route => (
              <div key={route.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-slate-800">{route.name}</p>
                    <p className="text-xs text-slate-400 mb-2.5">{route.stops?.length || 0} stops recorded</p>
                  </div>
                  <KebabMenu actions={[
                    { label: 'Edit', icon: '✏️', onClick: () => openEditRoute(route) },
                    { label: 'Delete', icon: '🗑️', onClick: () => setDeleteModal({ open: true, type: 'route', id: route.id, name: route.name }), danger: true },
                  ]} />
                </div>
                {route.correction_factor && (
                   <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs px-2.5 py-1.5 rounded-lg inline-flex font-medium">
                     Mapbox Correction Factor: {route.correction_factor.toFixed(2)}x
                   </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ──────────────── DELETE CONFIRMATION MODAL ──────────────── */}
      <Modal
        open={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, type: '', id: '', name: '', tripIdx: null })}
        title={`Delete ${deleteModal.type}?`}
      >
        <div className="text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🗑️</span>
          </div>
          <p className="text-slate-700 mb-1 font-medium">
            Are you sure you want to delete <strong>"{deleteModal.name}"</strong>?
          </p>
          <p className="text-sm text-slate-500 mb-6">
            {deleteModal.type === 'bus'
              ? 'This will remove the bus from Firestore and Realtime Database. Drivers assigned to it will be unlinked.'
              : deleteModal.type === 'trip'
              ? 'This trip and all its stops will be permanently removed. Students will no longer see it.'
              : 'This will remove the route and unassign it from any buses currently using it.'
            }
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteModal({ open: false, type: '', id: '', name: '', tripIdx: null })}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={
                deleteModal.type === 'bus' ? handleDeleteBus 
                : deleteModal.type === 'trip' ? handleDeleteTrip 
                : handleDeleteRoute
              }
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition"
            >
              Yes, delete
            </button>
          </div>
        </div>
      </Modal>

      {/* ──────────────── EDIT BUS MODAL ──────────────── */}
      <Modal
        open={editBusModal.open}
        onClose={() => setEditBusModal({ open: false, bus: null })}
        title="Edit Bus"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1 font-medium">Bus Name</label>
            <input
              value={editBusForm.name}
              onChange={e => setEditBusForm({ ...editBusForm, name: e.target.value })}
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. Bus A"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1 font-medium">Status</label>
            <div className="flex gap-2">
              <button
                onClick={() => setEditBusForm({ ...editBusForm, isActive: true })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                  editBusForm.isActive ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setEditBusForm({ ...editBusForm, isActive: false })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                  !editBusForm.isActive ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                Inactive
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setEditBusModal({ open: false, bus: null })}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleEditBus}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition"
            >
              Save changes
            </button>
          </div>
        </div>
      </Modal>

      {/* ──────────────── EDIT ROUTE MODAL ──────────────── */}
      <Modal
        open={editRouteModal.open}
        onClose={() => setEditRouteModal({ open: false, route: null })}
        title="Edit Route"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="text-xs text-slate-500 block mb-1 font-medium">Route Name</label>
            <input
              value={editRouteForm.name}
              onChange={e => setEditRouteForm({ ...editRouteForm, name: e.target.value })}
              className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p className="font-medium text-slate-700 mb-2">Stop 1 (Departure)</p>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Stop Name" value={editRouteForm.stop1Name} onChange={e => setEditRouteForm({...editRouteForm, stop1Name: e.target.value})} className="w-full border p-2 rounded-md" />
              <input placeholder="Time" value={editRouteForm.stop1Time} onChange={e => setEditRouteForm({...editRouteForm, stop1Time: e.target.value})} className="w-full border p-2 rounded-md" />
              <input placeholder="Latitude" type="number" value={editRouteForm.stop1Lat} onChange={e => setEditRouteForm({...editRouteForm, stop1Lat: e.target.value})} className="w-full border p-2 rounded-md" />
              <input placeholder="Longitude" type="number" value={editRouteForm.stop1Lng} onChange={e => setEditRouteForm({...editRouteForm, stop1Lng: e.target.value})} className="w-full border p-2 rounded-md" />
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p className="font-medium text-slate-700 mb-2">Stop 2 (Destination)</p>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Stop Name" value={editRouteForm.stop2Name} onChange={e => setEditRouteForm({...editRouteForm, stop2Name: e.target.value})} className="w-full border p-2 rounded-md" />
              <input placeholder="Time" value={editRouteForm.stop2Time} onChange={e => setEditRouteForm({...editRouteForm, stop2Time: e.target.value})} className="w-full border p-2 rounded-md" />
              <input placeholder="Latitude" type="number" value={editRouteForm.stop2Lat} onChange={e => setEditRouteForm({...editRouteForm, stop2Lat: e.target.value})} className="w-full border p-2 rounded-md" />
              <input placeholder="Longitude" type="number" value={editRouteForm.stop2Lng} onChange={e => setEditRouteForm({...editRouteForm, stop2Lng: e.target.value})} className="w-full border p-2 rounded-md" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setEditRouteModal({ open: false, route: null })}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleEditRoute}
              disabled={calculating}
              className={`flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium transition ${calculating ? 'opacity-70' : 'hover:bg-blue-700'}`}
            >
              {calculating ? 'Recalculating...' : 'Save & Recalculate'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}