from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
import firebase_admin
from firebase_admin import credentials, auth, firestore
from dotenv import load_dotenv
import os

load_dotenv()

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()
app = FastAPI()

COLLEGE_DOMAIN = os.getenv("COLLEGE_EMAIL_DOMAIN")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://scaler-bus-prod.web.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/auth/verify-role")
async def verify_role(authorization: str = Header(...)):
    # authorization header format: "Bearer <firebase_id_token>"
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")

    id_token = authorization.replace("Bearer ", "")

    try:
        decoded = auth.verify_id_token(id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    uid = decoded["uid"]
    email = decoded.get("email", "")

    # Block non-college emails
    if not email.endswith(f"@{COLLEGE_DOMAIN}"):
        raise HTTPException(status_code=403, detail="Only college email addresses allowed")

    # Check if user already exists in Firestore
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()

    if user_doc.exists:
        # User already has a role — return it
        return {"role": user_doc.to_dict()["role"], "uid": uid}
    else:
        # First time login — assign default role 'student'
        user_data = {
            "uid": uid,
            "email": email,
            "displayName": decoded.get("name", ""),
            "role": "student",
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
        user_ref.set(user_data)
        return {"role": "student", "uid": uid}
