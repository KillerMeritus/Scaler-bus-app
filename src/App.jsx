import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import DriverApp from './pages/DriverApp';
import StudentApp from './pages/StudentApp';
import AdminPanel from './pages/AdminPanel';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/student" />} />

      {/* Protected routes — redirect to login if not authenticated */}
      <Route path="/driver" element={user ? <DriverApp /> : <Navigate to="/login" />} />
      <Route path="/student" element={user ? <StudentApp /> : <Navigate to="/login" />} />
      <Route path="/admin" element={user ? <AdminPanel /> : <Navigate to="/login" />} />

      {/* Default route */}
      <Route path="/" element={user ? <Navigate to="/student" /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
