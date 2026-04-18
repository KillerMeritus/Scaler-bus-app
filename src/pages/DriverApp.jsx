import { useState, useEffect, useRef } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { auth, db } from '../firebase/config';
import { signOut } from 'firebase/auth';
import StudentSchedule from './StudentSchedule';

export default function DriverApp() {
  const [activeTab, setActiveTab] = useState('panel'); // 'panel' | 'schedule'
  const [isRunning, setIsRunning] = useState(false);
  const [assignedBus, setAssignedBus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gpsStatus, setGpsStatus] = useState('idle'); // 'idle' | 'active' | 'error'
  const [lastUpdate, setLastUpdate] = useState(null);
  const gpsInterval = useRef(null);
  const [showDelayForm, setShowDelayForm] = useState(false);
  const [delayReason, setDelayReason] = useState('');

  // Find the bus assigned to this driver by the admin
  useEffect(() => {
    const busesRef = ref(db, 'buses');
    const unsubscribe = onValue(busesRef, (snap) => {
      const allBuses = snap.val() || {};
      const uid = auth.currentUser?.uid;
      
      const myBusEntries = Object.entries(allBuses).filter(([id, bus]) => bus.driverUid === uid);
      
      // Prefer newly created buses over the legacy hardcoded 'bus_01'
      let myBusEntry = myBusEntries.find(([id]) => id !== 'bus_01');
      if (!myBusEntry && myBusEntries.length > 0) myBusEntry = myBusEntries[0];
      
      if (myBusEntry) {
        setAssignedBus({ id: myBusEntry[0], ...myBusEntry[1] });
        setIsRunning(myBusEntry[1].status === 'running');
      } else {
        setAssignedBus(null);
        setIsRunning(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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
    if (!assignedBus?.id) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const payload = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0, // convert m/s to km/h
          heading: pos.coords.heading || 0,
          updatedAt: Date.now(),
        };
        set(ref(db, `buses/${assignedBus.id}/location`), payload);
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

  const toggleStatus = async () => {
    if (!assignedBus?.id) return;
    const newStatus = isRunning ? 'stopped' : 'running';
    await set(ref(db, `buses/${assignedBus.id}/status`), newStatus);
    if (newStatus === 'stopped') {
      await set(ref(db, `buses/${assignedBus.id}/delay`), null);
    }
  };

  const reportDelay = async () => {
    if (!assignedBus?.id || !delayReason.trim()) return;
    // We only set the delay object, we DO NOT change the status to 'delayed'
    // This allows the GPS coordinates to keep updating in the background!
    await set(ref(db, `buses/${assignedBus.id}/delay`), {
      reason: delayReason.trim(),
      reportedAt: Date.now(),
    });
    setDelayReason('');
    setShowDelayForm(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const renderPanel = () => {
    if (!assignedBus) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 mt-20">
          <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center text-4xl mb-4 pt-1">🚏</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">No Bus Assigned</h2>
          <p className="text-slate-500 mb-6 font-medium">You have not been assigned to a bus yet. Please contact the administrator.</p>
          <button onClick={() => signOut(auth)} className="text-sm font-bold text-slate-600 bg-white border border-slate-200 px-6 py-2.5 rounded-xl hover:bg-slate-50">Sign out</button>
        </div>
      );
    }

    return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-xl font-semibold">Driver Panel</h1>
          <p className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-1">
            Driving: {assignedBus.name}
          </p>
        </div>
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

      <div className="mt-6 bg-white border border-slate-200 p-4 rounded-xl">
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Assigned Route</p>
        <p className="font-semibold text-slate-800 text-lg">{assignedBus.routeName || assignedBus.route || 'No route assigned'}</p>
        <p className="text-xs text-slate-400 mt-1">This route is locked by the admin.</p>
      </div>

      <div className="mt-4">
        {!showDelayForm ? (
          <button
            onClick={() => setShowDelayForm(true)}
            className="w-full py-3 border border-amber-400 text-amber-600 rounded-xl text-sm font-medium hover:bg-amber-50"
          >
            Report delay
          </button>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-medium text-amber-800 mb-2">Reason for delay</p>
            <input
              value={delayReason}
              onChange={e => setDelayReason(e.target.value)}
              maxLength={120}
              placeholder="e.g. Traffic jam at main road..."
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm mb-3 bg-white"
            />
            <div className="flex gap-2">
              <button
                onClick={reportDelay}
                className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-sm font-medium"
              >
                Send
              </button>
              <button
                onClick={() => setShowDelayForm(false)}
                className="flex-1 bg-white border border-slate-200 rounded-lg py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

  return (
    <div className="min-h-screen bg-slate-50 max-w-sm mx-auto pb-16 flex flex-col">
      {/* ──── DRIVER PANEL TAB ──── */}
      {activeTab === 'panel' && renderPanel()}

      {/* ──── SCHEDULE TAB ──── */}
      {activeTab === 'schedule' && (
        <>
          <div className="flex justify-between items-center px-5 py-4 bg-white border-b border-slate-100">
            <h1 className="text-lg font-semibold text-slate-800">Assigned Schedules</h1>
            <button onClick={() => signOut(auth)} className="text-sm text-slate-400">Sign out</button>
          </div>
          <StudentSchedule />
        </>
      )}

      {/* ──── BOTTOM TAB BAR ──── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex max-w-sm mx-auto z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setActiveTab('panel')}
          className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition ${
            activeTab === 'panel' ? 'text-amber-500' : 'text-slate-400'
          }`}
        >
          <span className="text-lg">🛞</span>
          <span className="text-[10px] font-semibold tracking-wide">PANEL</span>
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition ${
            activeTab === 'schedule' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          <span className="text-lg">📅</span>
          <span className="text-[10px] font-semibold tracking-wide">SCHEDULE</span>
        </button>
      </div>
    </div>
  );
}
