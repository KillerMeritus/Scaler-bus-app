import { useState, useEffect } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { auth, db } from '../firebase/config';
import { signOut } from 'firebase/auth';

export default function DriverApp() {
  const [isRunning, setIsRunning] = useState(false);
  const [busId, setBusId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Find which bus this driver is assigned to
  useEffect(() => {
    // In Phase 1, hardcode busId for testing. Phase 3 admin panel will assign dynamically.
    // Replace 'bus_01' with the ID you'll create manually in Firestore.
    const assignedBusId = 'bus_01';
    setBusId(assignedBusId);

    const statusRef = ref(db, `buses/${assignedBusId}/status`);
    const unsubscribe = onValue(statusRef, (snap) => {
      setIsRunning(snap.val() === 'running');
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const toggleStatus = async () => {
    if (!busId) return;
    const newStatus = isRunning ? 'stopped' : 'running';
    await set(ref(db, `buses/${busId}/status`), newStatus);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-sm mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-xl font-semibold text-slate-800">Driver Panel</h1>
        <button onClick={() => signOut(auth)} className="text-sm text-slate-400 hover:text-slate-600">
          Sign out
        </button>
      </div>

      {/* Big status toggle — easy to tap while driving */}
      <button
        onClick={toggleStatus}
        className={`w-full py-16 rounded-2xl text-white text-2xl font-bold transition-all active:scale-95 ${
          isRunning ? 'bg-green-500 hover:bg-green-600' : 'bg-slate-400 hover:bg-slate-500'
        }`}
      >
        {isRunning ? '🟢 Bus is Running' : '⚫ Bus is Stopped'}
      </button>

      <p className="text-center text-slate-400 text-sm mt-4">
        {isRunning ? 'Students can see your status' : 'Tap to start your shift'}
      </p>
    </div>
  );
}
