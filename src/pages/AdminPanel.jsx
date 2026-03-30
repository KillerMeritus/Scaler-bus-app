import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { firestore, auth } from '../firebase/config';
import { signOut } from 'firebase/auth';

export default function AdminPanel() {
  const [tab, setTab] = useState('buses'); // 'buses' | 'routes' | 'users'
  const [buses, setBuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    loadData();
  }, [tab]);

  const loadData = async () => {
    if (tab === 'buses') {
      const snap = await getDocs(collection(firestore, 'buses'));
      setBuses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    if (tab === 'users') {
      const snap = await getDocs(collection(firestore, 'users'));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    if (tab === 'routes') {
      const snap = await getDocs(collection(firestore, 'routes'));
      setRoutes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
  };

  const updateUserRole = async (uid, role) => {
    await updateDoc(doc(firestore, 'users', uid), { role });
    loadData();
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
                <div className="flex justify-between items-center">
                  <p className="font-medium text-slate-800">{bus.name}</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${bus.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {bus.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">ID: {bus.id}</p>
                <p className="text-xs text-slate-400">Driver UID: {bus.driverUid || 'Not assigned'}</p>
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
            {routes.map(route => (
              <div key={route.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="font-medium">{route.name}</p>
                <p className="text-xs text-slate-400">{route.stops?.length || 0} stops</p>
              </div>
            ))}
            <p className="text-xs text-slate-400 text-center pt-2">
              Add routes directly in Firestore for now. Full route editor in Phase 4.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}