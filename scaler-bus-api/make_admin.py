import firebase_admin
from firebase_admin import credentials, firestore
import sys

if len(sys.argv) < 2:
    print("Usage: python make_admin.py <your-email>")
    sys.exit(1)

email = sys.argv[1]

cred = credentials.Certificate("serviceAccountKey.json")
# Prevent initializing app twice if run in same environment
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()

print(f"Looking up user: {email}...")
docs = db.collection("users").where("email", "==", email).stream()

found = False
for doc in docs:
    found = True
    doc.reference.update({"role": "committee"})
    print(f"✅ Success! Updated role to 'committee' for {email}")

if not found:
    print(f"❌ Could not find a user with email '{email}'.")
    print("Make sure you have logged into the web app at least once so your account is created!")
