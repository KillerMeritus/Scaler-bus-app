from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import firebase_admin
from firebase_admin import credentials, auth, firestore
from dotenv import load_dotenv
from google.oauth2 import service_account
import google.auth.transport.requests
import os
import httpx
import asyncio
import json

load_dotenv()

COLLEGE_DOMAIN = os.getenv("COLLEGE_EMAIL_DOMAIN")
if not COLLEGE_DOMAIN:
    raise RuntimeError("COLLEGE_EMAIL_DOMAIN is not set in .env")

RTDB_URL = os.getenv("RTDB_URL")
CRON_SECRET = os.getenv("CRON_SECRET")
PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")

cred_json_env = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
if cred_json_env:
    # Use environment variable in production
    cred_dict = json.loads(cred_json_env)
    cred = credentials.Certificate(cred_dict)
elif os.path.exists("serviceAccountKey.json"):
    # Use local file in development
    cred = credentials.Certificate("serviceAccountKey.json")
else:
    raise RuntimeError(
        "FIREBASE_SERVICE_ACCOUNT_JSON environment variable is missing! "
        "Please add the contents of your serviceAccountKey.json to the Render Environment Variables tab."
    )

firebase_admin.initialize_app(cred)
db = firestore.client()


def get_access_token():
    if cred_json_env:
        sa_creds = service_account.Credentials.from_service_account_info(
            info=json.loads(cred_json_env), 
            scopes=["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/firebase.database"]
        )
    else:
        sa_creds = service_account.Credentials.from_service_account_file(
            "serviceAccountKey.json", 
            scopes=["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/firebase.database"]
        )
    request = google.auth.transport.requests.Request()
    sa_creds.refresh(request)
    return sa_creds.token


async def send_fcm_to_all(title: str, body: str):
    users = db.collection("users").where("role", "==", "student").stream()
    tokens = [u.to_dict().get("fcmToken") for u in users if u.to_dict().get("fcmToken")]

    if not tokens:
        print("No student tokens found — skipping notification")
        return

    url = f"https://fcm.googleapis.com/v1/projects/{PROJECT_ID}/messages:send"

    try:
        access_token = get_access_token()
    except Exception as e:
        print(f"Failed to get FCM access token: {e}")
        return

    async with httpx.AsyncClient() as client:
        for token in tokens:
            try:
                await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "message": {
                            "token": token,
                            "notification": {
                                "title": title,
                                "body": body
                            }
                        }
                    }
                )
            except Exception as e:
                print(f"Failed to send to token {token[:20]}...: {e}")

    print(f"Notification sent to {len(tokens)} students: {title}")


async def watch_bus_status():
    if not RTDB_URL:
        print("RTDB_URL not set — bus watcher not started")
        return

    print("RTDB watcher started")
    last_status = {}
    url = f"{RTDB_URL}/buses.json"
    headers = {"Accept": "text/event-stream"}

    while True:
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", url, headers=headers) as response:
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if raw in ("null", ""):
                            continue
                        try:
                            data = json.loads(raw)
                        except Exception:
                            continue
                        if not isinstance(data, dict):
                            continue

                        for bus_id, bus in data.items():
                            if not isinstance(bus, dict):
                                continue
                            new_status = bus.get("status")
                            old_status = last_status.get(bus_id)
                            bus_name = bus.get("name", bus_id)

                            if new_status == old_status:
                                continue

                            last_status[bus_id] = new_status
                            print(f"Bus {bus_id} status: {old_status} → {new_status}")

                            if new_status == "running":
                                asyncio.create_task(send_fcm_to_all(
                                    f"{bus_name} has started",
                                    "The bus is now running. Open the app for live location."
                                ))
                            elif new_status == "delayed":
                                delay_info = bus.get("delay", {})
                                reason = delay_info.get("reason", "Running late") if isinstance(delay_info, dict) else "Running late"
                                asyncio.create_task(send_fcm_to_all(
                                    f"{bus_name} is delayed",
                                    reason
                                ))

        except Exception as e:
            print(f"RTDB watcher error: {e} — retrying in 5s")
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(watch_bus_status())
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/verify-role")
async def verify_role(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")

    id_token = authorization.split(" ", 1)[-1].strip()

    try:
        decoded = auth.verify_id_token(id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    uid = decoded["uid"]
    email = decoded.get("email", "")

    # ------------- TEMPORARILY DISABLED -------------
    # if not email.endswith(f"@{COLLEGE_DOMAIN}"):
    #     raise HTTPException(status_code=403, detail="Only college email addresses allowed")
    # ------------------------------------------------
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()

    if user_doc.exists:
        return {"role": user_doc.to_dict()["role"], "uid": uid}
    else:
        user_data = {
            "uid": uid,
            "email": email,
            "displayName": decoded.get("name", ""),
            "role": "student",
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
        user_ref.set(user_data)
        return {"role": "student", "uid": uid}


@app.post("/notify/daily-reminder")
async def daily_reminder(authorization: str = Header(...)):
    if authorization != f"Bearer {CRON_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    await send_fcm_to_all(
        "Good morning! Bus schedule",
        "Check the app for today's bus timings."
    )
    return {"sent": True}
