import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { firestore, auth, db } from '../firebase/config';
import { signOut } from 'firebase/auth';

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
  const [tab, setTab] = useState('buses'); // 'buses' | 'routes' | 'users'
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
      // 1. Optimistic UI update so the dropdown feels instant
      setBuses(prev => prev.map(b => b.id === busId ? { ...b, ...updates } : b));
      
      // 2. Update Firestore
      await updateDoc(doc(firestore, 'buses', busId), updates);
      
      // 3. Mirror to RTDB so Driver and Student apps immediately pick it up
      // Use set() instead of update() to match DriverApp which works perfectly and avoids strict rule conflicts
      const promises = Object.entries(updates).map(([key, val]) => {
         return set(ref(db, `buses/${busId}/${key}`), val);
      });
      await Promise.all(promises);
      
    } catch (e) {
      console.error("Assignment error:", e);
      alert("Error saving assignment: " + e.message);
      loadData(); // Revert on failure
    }
  };

  const addBus = async () => {
    const name = prompt('Bus name (e.g. Bus A):');
    if (!name) return;
    const id = 'bus_' + Date.now();
    await setDoc(doc(firestore, 'buses', id), {
      name, isActive: true, defaultRoute: 'H1_H2', driverUid: ''
    });
    loadData();
  };

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-5 py-4 flex justify-between items-center">
        <h1 className="text-lg font-semibold">Admin Panel</h1>
        <button onClick={() => signOut(auth)} className="text-sm text-slate-400">Sign out</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-4 bg-white border-b border-slate-100">
        {['buses', 'routes', 'users'].map(t => (
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
                  <span className={`text-xs px-2 py-1 rounded-full ${bus.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {bus.isActive ? 'Active' : 'Inactive'}
                  </span>
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
                <p className="font-medium text-slate-800">{route.name}</p>
                <p className="text-xs text-slate-400 mb-2.5">{route.stops?.length || 0} stops recorded</p>
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
    </div>
  );
}