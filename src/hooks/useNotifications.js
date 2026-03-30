import { useEffect } from 'react';
import { getToken } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { messaging, firestore, auth } from '../firebase/config';

// It is best practice to put this in your .env file as VITE_FIREBASE_VAPID_KEY,
// but pasting it directly here works perfectly too!
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'YOUR_VAPID_KEY_FROM_STEP_3_1';

export function useNotifications() {
  useEffect(() => {
    const requestPermission = async () => {
      if (!auth.currentUser) return;
      if (!('Notification' in window)) return; // browser doesn't support it

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      try {
        const token = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (token) {
          // Save token to Firestore under this user
          await setDoc(
            doc(firestore, 'users', auth.currentUser.uid),
            { fcmToken: token, fcmUpdatedAt: new Date() },
            { merge: true }
          );
        }
      } catch (err) {
        console.error('FCM token error:', err);
      }
    };

    requestPermission();
  }, []);
}
