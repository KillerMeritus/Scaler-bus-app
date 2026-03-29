import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import DriverApp from './pages/DriverApp';
import StudentApp from './pages/StudentApp';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  const { user, role } = useAuth();

  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  }

  if (!user) return <Login />;

  if (role === 'driver') return <DriverApp />;
  if (role === 'committee') return <AdminPanel />;
  return <StudentApp />; // default for 'student'
}
