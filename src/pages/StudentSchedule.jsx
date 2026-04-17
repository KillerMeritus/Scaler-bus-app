import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase/config';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_INDEX_MAP = [6, 0, 1, 2, 3, 4, 5]; // JS getDay(): 0=Sun → map to our index

export default function StudentSchedule() {
  const [schedules, setSchedules] = useState([]);
  const [selectedDay, setSelectedDay] = useState(() => {
    const jsDay = new Date().getDay(); // 0=Sun, 1=Mon, ...
    return DAYS[DAY_INDEX_MAP[jsDay]];
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real-time listener — updates instantly when admin saves
    const unsub = onSnapshot(collection(firestore, 'schedules'), (snap) => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Failed to load schedules:', err);
      setLoading(false);
    });
    return () => unsub(); // cleanup on unmount
  }, []);


  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Loading schedule...
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <div className="text-4xl mb-3">📅</div>
        <p className="text-slate-500 font-medium">No schedules published yet</p>
        <p className="text-xs text-slate-400 mt-1">The admin hasn't added bus timetables yet.</p>
      </div>
    );
  }

  return (
    <div className="pb-4">
      {/* Day pill selector */}
      <div className="flex gap-1.5 px-4 py-3 overflow-x-auto no-scrollbar">
        {DAYS.map(day => (
          <button
            key={day}
            onClick={() => setSelectedDay(day)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex-shrink-0 ${
              selectedDay === day
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Bus schedule cards */}
      <div className="px-4 space-y-4 mt-1">
        {schedules.map(schedule => {
          // Migration/Compatibility Layer
          let trips = [];
          if (schedule.trips) {
            trips = schedule.trips;
          } else if (schedule.stops) {
            trips = [{ tripName: 'General Schedule', stops: schedule.stops }];
          }

          return (
            <div key={schedule.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Bus header */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🚌</span>
                  <p className="font-bold text-slate-800 text-sm tracking-tight">{schedule.busName || schedule.id}</p>
                </div>
                {schedule.lastUpdated && (
                  <span className="text-[10px] text-slate-400 font-medium">Updated Recently</span>
                )}
              </div>

              {/* Trips list */}
              <div className="divide-y divide-slate-100">
                {trips.map((trip, tIdx) => {
                  const stopsForDay = (trip.stops || []).map(stop => ({
                    name: stop.name,
                    time: stop.times?.[selectedDay] || '',
                  }));

                  const hasService = stopsForDay.some(s => s.time);

                  if (!hasService) return null;

                  return (
                    <div key={tIdx} className="p-4">
                      {trips.length > 1 && (
                        <h4 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                           <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                           {trip.tripName || `Trip ${tIdx + 1}`}
                        </h4>
                      )}
                      
                      <div className="space-y-0.5">
                        {stopsForDay.map((stop, i) => (
                          <div key={i} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-3">
                              <div className="relative flex flex-col items-center">
                                <div className={`w-2 h-2 rounded-full ${
                                  stop.time ? 'bg-blue-400' : 'bg-slate-200'
                                }`} />
                                {i < stopsForDay.length - 1 && (
                                  <div className="w-0.5 h-4 bg-slate-100 mt-0.5" />
                                )}
                              </div>
                              <span className={`text-[13px] ${stop.time ? 'text-slate-600 font-medium' : 'text-slate-300'}`}>
                                {stop.name || "Unnamed Stop"}
                              </span>
                            </div>
                            
                            {stop.time ? (
                              <span className="text-[12px] font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                {stop.time}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 italic">—</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* No service check */}
              {(!trips.some(t => t.stops?.some(s => s.times?.[selectedDay]))) && (
                <div className="px-4 py-8 text-center bg-white">
                  <p className="text-xs text-slate-400 font-medium italic">No service scheduled for {selectedDay}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
