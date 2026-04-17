import { useState, useEffect, useRef } from 'react';

export default function KebabMenu({ actions = [] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-600"
        aria-label="More options"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[140px] z-50 animate-in fade-in">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); action.onClick(); }}
              className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center gap-2 transition ${
                action.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {action.icon && <span className="text-base">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
