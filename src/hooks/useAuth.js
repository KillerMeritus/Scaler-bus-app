import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';

export function useAuth() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [role, setRole] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Get the ID token and send to FastAPI to get/create role
          const token = await firebaseUser.getIdToken();
          const res = await fetch('http://localhost:8000/auth/verify-role', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          
          if (res.ok) {
            const data = await res.json();
            setRole(data.role); // 'student', 'driver', or 'committee'
            setUser(firebaseUser); // ✅ Only set user after backend verifies them!
          } else {
            // Non-college email or error — sign out
            await auth.signOut();
            setUser(null);
            setRole(null);
            alert('Failed: Only college email addresses are allowed.');
          }
        } catch (err) {
          console.error("Backend fetch error:", err);
          await auth.signOut();
          setUser(null);
          setRole(null);
          alert('Could not reach backend. Is FastAPI running?');
        }
      } else {
        setUser(null);
        setRole(null);
      }
    });
    return unsubscribe;
  }, []);

  return { user, role };
}
