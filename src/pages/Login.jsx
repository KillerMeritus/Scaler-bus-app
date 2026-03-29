import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase/config';

export default function Login() {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'sst.scaler.com' }); // properly matching your .env domain
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged in useAuth.js handles the rest
    } catch (err) {
      alert('Login failed: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Scaler Bus</h1>
        <p className="text-slate-500 text-sm mb-8">Sign in with your college Google account</p>
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition"
        >
          Secure Sign In
        </button>
      </div>
    </div>
  );
}
