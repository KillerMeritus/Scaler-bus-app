import { useState, useEffect, lazy, Suspense } from 'react';
import { ref, onValue } from 'firebase/database';
import { collection, getDocs } from 'firebase/firestore';
import { db, firestore, auth } from '../firebase/config';
import { signOut } from 'firebase/auth';
import { useNotifications } from '../hooks/useNotifications';

// Haversine formula to calculate straight-line distance in km
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}

// Lazy-load the map so the rest of the app loads fast
const BusMap = lazy(() => import('../components/BusMap'));

const ROUTE_LABELS = {
  H1_H2: 'Hostel 1 → Hostel 2',
  H2_H1: 'Hostel 2 → Hostel 1',
};

export default function StudentApp() {
  useNotifications();

  const [buses, setBuses] = useState({});
  const [selectedBusId, setSelectedBusId] = useState(null);
  
  const [routes, setRoutes] = useState({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Fetch static routes for ETA math
    const fetchRoutes = async () => {
      const snap = await getDocs(collection(firestore, 'routes'));
      const routesObj = {};
      snap.docs.forEach(d => { routesObj[d.id] = d.data(); });
      setRoutes(routesObj);
    };
    fetchRoutes();

    // 1-second ticker to update 'timeSinceUpdate' live on screen
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const busesRef = ref(db, 'buses');
    const unsubscribe = onValue(busesRef, (snap) => {
      const data = snap.val() || {};
      setBuses(data);
      // Auto-select first bus
      if (!selectedBusId && Object.keys(data).length > 0) {
        setSelectedBusId(Object.keys(data)[0]);
      }
    });
    return unsubscribe;
  }, [selectedBusId]);

  const bus = selectedBusId ? buses[selectedBusId] : null;
  const isRunning = bus?.status === 'running';
  const isDelayed = !!bus?.delay;
  const location = bus?.location;
  
  const timeSinceUpdate = location ? Math.floor((now - location.updatedAt) / 1000) : null;
  const isStale = isRunning && timeSinceUpdate !== null && timeSinceUpdate > 45; // State 6

  // Mathematical ETA State Logic!
  let activeRouteData = bus?.route ? routes[bus.route] : null;
  let nextStop = null;
  let MathETA = null;
  let etaMessage = null;
  let isStoppedLong = false;

  if (isRunning && location && activeRouteData && activeRouteData.stops?.length > 0) {
     nextStop = activeRouteData.stops[activeRouteData.stops.length - 1]; // Use final destination
     
     const straightKm = getDistanceFromLatLonInKm(location.lat, location.lng, nextStop.lat, nextStop.lng);
     const correction = activeRouteData.correction_factor || 1.3;
     const roadKm = straightKm * correction;
     const speedKmH = location.speed || 0;
     
     if (speedKmH > 2) {
       // Moving normally
       const hours = roadKm / speedKmH;
       MathETA = Math.ceil(hours * 60);
     } else {
       // Stopped at signal or traffic
       if (timeSinceUpdate > 60) {
         isStoppedLong = true; // State 4
       } else {
         etaMessage = "Bus has stopped. ETA will update when moving."; // State 3
       }
     }
  }

  return (
    <div className="min-h-screen bg-slate-50 max-w-sm mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-4 bg-white border-b border-slate-100">
        <h1 className="text-lg font-semibold text-slate-800">Bus Tracker</h1>
        <button onClick={() => signOut(auth)} className="text-sm text-slate-400">Sign out</button>
      </div>

      {/* Bus selector — show only if multiple buses */}
      {Object.keys(buses).length > 1 && (
        <div className="flex gap-2 px-5 pt-4">
          {Object.entries(buses).map(([id, b]) => (
            <button
              key={id}
              onClick={() => setSelectedBusId(id)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${
                selectedBusId === id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {b.name || id}
            </button>
          ))}
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Status badge */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium w-fit ${
          isDelayed ? 'bg-amber-100 text-amber-700' :
          isRunning ? 'bg-green-100 text-green-700' :
          'bg-slate-100 text-slate-500'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            isDelayed ? 'bg-amber-500' : isRunning ? 'bg-green-500' : 'bg-slate-400'
          }`} />
          {isDelayed ? 'Delayed' : isRunning ? 'Running' : 'Not running'}
          {!isDelayed && isRunning && activeRouteData && ` · ${activeRouteData.name}`}
        </div>

        {/* State 1: Not started */
        !isRunning && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-2">Not started yet</h3>
            {activeRouteData ? (
               <div className="text-sm text-slate-600">
                 <p className="mb-3"><strong>Route:</strong> {activeRouteData.name}</p>
                 <div className="space-y-2 border-t pt-2 border-slate-100">
                   {activeRouteData.stops?.map((s, i) => (
                     <div key={i} className="flex justify-between items-center">
                       <span className="flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                         {s.name}
                       </span>
                       <span className="font-medium text-slate-800 bg-slate-50 px-2 py-0.5 rounded">{s.scheduledTime}</span>
                     </div>
                   ))}
                   {(!activeRouteData.stops || activeRouteData.stops.length === 0) && (
                      <p className="text-xs text-slate-400 italic">No stops configured for this route.</p>
                   )}
                 </div>
               </div>
            ) : (
               <p className="text-sm text-slate-500">Scheduled route information will appear here once selected.</p>
            )}
          </div>
        )}

        {/* State 5: Delayed */
        isDelayed && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-4 shadow-sm">
            <h3 className="font-semibold text-red-700 flex items-center gap-2 mb-3">
              <span className="text-xl">⚠️</span> Delay Reported
            </h3>
            <p className="text-sm text-red-900 bg-white/60 p-3 rounded-lg border border-red-100 font-medium">
              "{bus?.delay?.reason || "Running late due to unexpected conditions."}"
            </p>
            <p className="text-xs text-red-600 mt-3 flex items-center gap-1.5">
               <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
               All students have been notified via push notification.
            </p>
          </div>
        )}

        {/* Live map (States 2, 3, 4, 6) */}
        {isRunning && (
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative z-0">
            <Suspense fallback={<div className="h-64 bg-slate-100 flex items-center justify-center text-slate-400">Loading map...</div>}>
              <BusMap location={location} busName={bus?.name} />
            </Suspense>
          </div>
        )}

        {/* Dynamic ETA & Status Card (States 2, 3, 4, 6) */}
        {isRunning && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 relative z-10 -mt-2">
               {/* Destination Info */}
               {nextStop && (
                  <div className="flex justify-between items-start pb-4 border-b border-slate-100">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5 font-medium uppercase tracking-wider">Destination</p>
                      <p className="font-semibold text-slate-800 text-lg">{nextStop.name}</p>
                    </div>
                    
                    {/* State 6: Stale Data */
                    isStale && (
                       <div className="bg-amber-50 text-amber-700 px-3 py-2 rounded-lg text-xs font-medium border border-amber-200 text-right">
                          <p className="text-sm shadow-sm">⚠️ GPS Stalled</p>
                          <p className="opacity-80 mt-0.5">for {timeSinceUpdate}s</p>
                       </div>
                    )}
                    
                    {/* State 4: Stopped too long */
                    !isStale && isStoppedLong && (
                       <div className="bg-orange-50 text-orange-700 px-3 py-2 rounded-lg text-xs font-medium border border-orange-200 text-right w-1/2">
                          <span className="block mb-1">⚠️ Bus is stationary</span>
                          <span className="opacity-80">Waiting for driver update</span>
                       </div>
                    )}

                    {/* State 2: Normal ETA */
                    !isStale && !isStoppedLong && MathETA !== null && (
                      <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-xl border border-blue-100 flex items-baseline gap-1">
                         <span className="font-bold text-2xl tracking-tight">~{MathETA}</span>
                         <span className="text-xs font-semibold uppercase">min</span>
                      </div>
                    )}
                  </div>
               )}

               {/* State 3 message */
               !isStale && !isStoppedLong && etaMessage && (
                  <div className="bg-slate-50 text-slate-600 text-xs px-3 py-2.5 rounded-lg border border-slate-200 font-medium">
                    {etaMessage}
                  </div>
               )}

               {/* Telemetry Footer */}
               {location && (
                  <div className="flex justify-between items-center pt-1">
                    <div className="flex items-center gap-2">
                       <div className="bg-slate-100 px-2.5 py-1 rounded text-xs font-semibold text-slate-600 tracking-wide border border-slate-200">
                         {location.speed || 0} km/h
                       </div>
                       {location.speed === 0 && <span className="text-xs text-amber-600 font-medium px-2 bg-amber-50 rounded py-1">🟡 Stopped</span>}
                    </div>
                    <div className="text-xs text-slate-400 font-medium">
                       Updated: {timeSinceUpdate !== null ? `${timeSinceUpdate}s ago` : '—'}
                    </div>
                  </div>
               )}
            </div>
        )}
      </div>
    </div>
  );
}
