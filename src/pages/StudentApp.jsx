import { useState, useEffect, lazy, Suspense } from 'react';
import { ref, onValue } from 'firebase/database';
import { db, auth } from '../firebase/config';
import { signOut } from 'firebase/auth';
import { useNotifications } from '../hooks/useNotifications';

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
  }, []);

  const bus = selectedBusId ? buses[selectedBusId] : null;
  const isRunning = bus?.status === 'running';
  const isDelayed = bus?.status === 'delayed';
  const location = bus?.location;
  const timeSinceUpdate = location
    ? Math.floor((Date.now() - location.updatedAt) / 1000)
    : null;

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
          isRunning ? 'bg-green-100 text-green-700' :
          isDelayed ? 'bg-amber-100 text-amber-700' :
          'bg-slate-100 text-slate-500'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            isRunning ? 'bg-green-500' : isDelayed ? 'bg-amber-500' : 'bg-slate-400'
          }`} />
          {isRunning ? 'Running' : isDelayed ? 'Delayed' : 'Not running'}
          {bus?.route && isRunning && ` · ${ROUTE_LABELS[bus.route] || bus.route}`}
        </div>

        {/* Live map */}
        {isRunning ? (
          <Suspense fallback={<div className="h-64 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">Loading map...</div>}>
            <BusMap location={location} busName={bus?.name} />
          </Suspense>
        ) : (
          <div className="h-64 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-sm">
            Map visible when bus is running
          </div>
        )}

        {/* Stale data warning */}
        {isRunning && timeSinceUpdate !== null && timeSinceUpdate > 30 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2 rounded-xl">
            ⚠️ Location not updated for {timeSinceUpdate}s — driver may have lost connection
          </div>
        )}

        {/* Speed info */}
        {isRunning && location && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">Speed</p>
              <p className="text-lg font-semibold text-slate-800">{location.speed || 0} km/h</p>
            </div>
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">Last updated</p>
              <p className="text-lg font-semibold text-slate-800">
                {timeSinceUpdate !== null ? `${timeSinceUpdate}s ago` : '—'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
