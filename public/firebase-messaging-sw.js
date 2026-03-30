importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAwxVfiVgfgRIYoDXsMOyldt96CBbpqCts",
  authDomain: "scaler-bus-app-821d9.firebaseapp.com",
  projectId: "scaler-bus-app-821d9",
  storageBucket: "scaler-bus-app-821d9.appspot.com",
  messagingSenderId: "197505814065",
  appId: "1:197505814065:web:0d48c63f6d7188dd214f10"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/bus-icon.png',
  });
});
