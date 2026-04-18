# 🚌 Scaler Bus App

A complete, full-stack real-time transit tracking and scheduling platform designed for students, route administrators, and bus drivers.

## 🌟 Features

### 🎓 Student App
*   **Live Tracker**: Real-time GPS mapping showing exact bus locations, speed, and real-time ETAs dynamically calculated based on distance and traffic.
*   **Live Schedule Timetables**: Dynamic multi-trip daily schedules showing where the bus currently is in its lifecycle, instantly synced with any changes from the administration.
*   **Smart Statuses**: Automatic color-coded delay reports and estimated arrival projections natively implemented over Mapbox.
*   **FCM Notifications**: Receive push notifications to your device when your delayed/stopped bus starts moving.

### 🛞 Driver Panel
*   **One-Tap Broadcast**: One simple tap to transition from "Stopped" to "Running," instantly broadcasting GPS data to all tracking students.
*   **Live Delay Reporting**: Tap "Report Delay" to log issues (e.g., Traffic jam, mechanical failure). Students are instantly updated via the UI and push notifications.
*   **Driver Schedule Tab**: See exactly what route trips and shifts are assigned to you for the day in a beautiful UI.

### 💼 Admin Panel
*   **Fleet Management**: Seamlessly add, remove, and manage buses and drivers.
*   **Route Editor**: Integrated Mapbox tools to drop interactive map pins and construct precise route paths for student calculation.
*   **Complex Schedule Builder**: Support for multi-trip schedules (e.g., "Morning Shift", "Evening Shift"). Modify times over a dynamic 7-day grid that auto-updates student devices in real-time without reloading.

## 🛠 Tech Stack

*   **Frontend Data & Layout**: React (Vite) + Tailwind CSS (Fully Responsive)
*   **Auth**: Google OAuth (Firebase Authentication)
*   **Data Models**: 
    *   *Firebase Realtime Database*: Ultra-low latency transmission for live driver GPS metrics.
    *   *Firebase Firestore*: Scalable document management for static routes, complex nested schedules, and user roles.
*   **Backend Server**: Python 3.11 (FastAPI) deployed on Render. Handles administrative asynchronous jobs and push notification dispatches.
*   **Map Mapping**: React Leaflet & Mapbox GL APIs
*   **Hosting**: Firebase Cloud Hosting

## 🚀 Deployment

The project is structured into two main deployable sectors:

### Frontend
```bash
npm install
npm run build
firebase deploy --only hosting
```

### Backend (scaler-bus-api)
*   Managed via pip `requirements.txt`
*   Set your environment variables (`RTDB_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`) on your hosting provider (Render).
*   Run via `uvicorn main:app --host 0.0.0.0 --port 10000`
