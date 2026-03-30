import { useState, useEffect, useRef } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { auth, db } from '../firebase/config';
import { signOut } from 'firebase/auth';

export default function DriverApp() {
  const [isRunning, setIsRunning] = useState(false);
  const [busId] = useState('bus_01');
  const [loading, setLoading] = useState(true);
  const [gpsStatus, setGpsStatus] = useState('idle'); // 'idle' | 'active' | 'error'
  const [lastUpdate, setLastUpdate] = useState(null);
  const gpsInterval = useRef(null);
  const [route, setRoute] = useState('H1_H2');

  useEffect(() => {
    const statusRef = ref(db, `buses/${busId}/status`);
    const unsubscribe = onValue(statusRef, (snap) => {
      const status = snap.val();
      setIsRunning(status === 'running');
      setLoading(false);
    });
    return unsubscribe;
  }, [busId]);

  // Start or stop GPS based on running status
  useEffect(() => {
    if (isRunning) {
      startGPS();
    } else {
      stopGPS();
    }
    return () => stopGPS();
  }, [isRunning]);

  // Pause GPS when tab is hidden, resume when visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRunning) {
        startGPS();
      } else {
        stopGPS();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning]);

  const writeLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const payload = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0, // convert m/s to km/h
          heading: pos.coords.heading || 0,
          updatedAt: Date.now(),
        };
        set(ref(db, `buses/${busId}/location`), payload);
        setGpsStatus('active');
        setLastUpdate(new Date().toLocaleTimeString());
      },
      (err) => {
        console.error('GPS error:', err);
        setGpsStatus('error');
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 8000 }
    );
  };

  const startGPS = () => {
    if (gpsInterval.current) return; // already running
    writeLocation(); // write immediately
    gpsInterval.current = setInterval(writeLocation, 5000);
  };

  const stopGPS = () => {
    if (gpsInterval.current) {
      clearInterval(gpsInterval.current);
      gpsInterval.current = null;
    }
    setGpsStatus('idle');
  };

  useEffect(() => {
    const routeRef = ref(db, `buses/${busId}/route`);
    const unsub = onValue(routeRef, (snap) => {
      if (snap.val()) setRoute(snap.val());
    });
    return unsub;
  }, [busId]);

  const selectRoute = async (routeId) => {
    if (isRunning) return; // cannot change route while running
    setRoute(routeId);
    await set(ref(db, `buses/${busId}/route`), routeId);
  };

  const toggleStatus = async () => {
    const newStatus = isRunning ? 'stopped' : 'running';
    await set(ref(db, `buses/${busId}/driverUid`), auth.currentUser.uid);
    await set(ref(db, `buses/${busId}/status`), newStatus);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-sm mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-xl font-semibold">Driver Panel</h1>
        <button onClick={() => signOut(auth)} className="text-sm text-slate-400">Sign out</button>
      </div>

      <button
        onClick={toggleStatus}
        className={`w-full py-16 rounded-2xl text-white text-2xl font-bold transition-all active:scale-95 ${
          isRunning ? 'bg-green-500' : 'bg-slate-400'
        }`}
      >
        {isRunning ? '🟢 Bus is Running' : '⚫ Bus is Stopped'}
      </button>

      {/* GPS indicator */}
      {isRunning && (
        <div className={`mt-4 p-3 rounded-xl text-sm text-center ${
          gpsStatus === 'active' ? 'bg-green-50 text-green-700' :
          gpsStatus === 'error' ? 'bg-red-50 text-red-600' :
          'bg-slate-100 text-slate-500'
        }`}>
          {gpsStatus === 'active' && `📡 GPS active · last sent ${lastUpdate}`}
          {gpsStatus === 'error' && '⚠️ GPS error — check location permissions'}
          {gpsStatus === 'idle' && 'Starting GPS...'}
        </div>
      )}

      <div className="mt-6">
        <p className="text-sm font-medium text-slate-500 mb-3">Today's route</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'H1_H2', label: 'Hostel 1 → 2' },
            { id: 'H2_H1', label: 'Hostel 2 → 1' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => selectRoute(id)}
              disabled={isRunning}
              className={`py-3 rounded-xl text-sm font-medium border transition ${
                route === id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200'
              } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        {isRunning && <p className="text-xs text-slate-400 mt-2 text-center">Stop the bus to change route</p>}
      </div>
    </div>
  );
}
