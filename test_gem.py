import urllib.request
import json
from app.core.config import get_settings

settings = get_settings()
api_key = settings.gemini_api_key
model = (settings.gemini_model or "gemini-2.0-flash").strip().lstrip("/")
if not model.startswith("models/"):
    model = f"models/{model}"
url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent?key={api_key}"
payload = {
    "contents": [{"parts": [{"text": "Generate a JSON with a single key 'risk_score' and value 10"}]}],
    "generationConfig": {
        "temperature": 0.1,
        "responseMimeType": "application/json"
    }
}
req = urllib.request.Request(url, method="POST", headers={"Content-Type": "application/json"})
body = json.dumps(payload).encode()

try:
    resp = urllib.request.urlopen(req, body)
    data = json.loads(resp.read().decode())
    print("SUCCESS")
    print(json.dumps(data, indent=2))
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print(e.read().decode())
