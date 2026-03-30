import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceAccountKey.json")
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)
db = firestore.client()

routes = {
    "H1_H2": {
        "name": "Hostel 1 → Hostel 2",
        "stops": [
            {"name": "College Gate", "lat": 18.5204, "lng": 73.8567, "scheduledTime": "07:30"},
            {"name": "Hostel 2", "lat": 18.5220, "lng": 73.8580, "scheduledTime": "08:00"}
        ]
    },
    "H2_H1": {
        "name": "Hostel 2 → Hostel 1",
        "stops": [
            {"name": "Hostel 2", "lat": 18.5220, "lng": 73.8580, "scheduledTime": "17:30"},
            {"name": "College Gate", "lat": 18.5204, "lng": 73.8567, "scheduledTime": "18:00"}
        ]
    }
}

for route_id, data in routes.items():
    db.collection("routes").document(route_id).set(data)
    print(f"Created route document: {route_id}")

print("✅ Successfully seeded routes in Firestore!")
