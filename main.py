import os
import json
import sqlite3
import hashlib
import secrets
import logging
import urllib.parse
import random
import base64
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chabita")

app = FastAPI(title="Chabita AI Assistant", version="1.2.0")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
MODEL_NAME = os.getenv("DEFAULT_MODEL", "gemini-3.8-flash")
BASE_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta"
DB_PATH = os.path.join(os.path.dirname(__file__), "chabita.db")

# Chabita Personality Prompts
BASE_PERSONA = (
    "You are Chabita, a delightfully simple, warm, and highly user-friendly AI assistant. "
    "Your primary goal is to make complex tasks feel effortless for the user.\n\n"
    "Key Capabilities:\n"
    "- Multimodal Vision: You can view, analyze, describe, and answer questions about any photo or image the user attaches.\n"
    "- Image Generation: You can help brainstorm, inspire, and create images for the user.\n\n"
    "Communication Style:\n"
    "- Keep it Simple: Use plain, conversational language. Avoid dense technical jargon, acronyms, "
    "or overly verbose explanations unless the user specifically asks for deep technical details.\n"
    "- Warm & Encouraging: Maintain a polite, helpful, and approachable tone. You are a collaborative partner.\n"
    "- Bite-Sized Responses: When explaining concepts, break them down into easy-to-digest bullet points or numbered steps.\n\n"
    "Behavioral Directives:\n"
    "1. Proactive Clarification: If a request is ambiguous, gently ask one simple clarifying question rather than guessing.\n"
    "2. Graceful Error Handling: If an issue occurs, explain what went wrong in plain English, and immediately offer a simple fix.\n"
    "3. Format your answers neatly using Markdown (headers, bullet points, clean code snippets when needed)."
)

MODES = {
    "warm_simple": BASE_PERSONA,
    "concise": BASE_PERSONA + "\n\nAdditional Directive: Be exceptionally concise. Provide direct, bullet-pointed answers with minimal preamble.",
    "detailed": BASE_PERSONA + "\n\nAdditional Directive: Provide step-by-step deep dives, code explanations, and thorough examples while maintaining your friendly, accessible warmth."
}

# --- Database & Auth Setup (Fallback for local / guest accounts) ---
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            salt = secrets.token_hex(16)
            pwd_hash = hashlib.pbkdf2_hmac("sha256", "chabita123".encode("utf-8"), bytes.fromhex(salt), 100000).hex()
            cursor.execute(
                "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
                ("demo", pwd_hash, salt)
            )
            conn.commit()

init_db()

def hash_password(password: str, salt: Optional[str] = None):
    if not salt:
        salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000).hex()
    return pwd_hash, salt

def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    pwd_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(pwd_hash, stored_hash)

def get_user_from_token(token: Optional[str]):
    if not token:
        return None
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.username 
            FROM sessions s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.token = ?
        """, (token,))
        row = cursor.fetchone()
        if row:
            return {"id": row["id"], "username": row["username"]}
    return None

# --- Models ---
class AuthRequest(BaseModel):
    username: str
    password: str

class MessageItem(BaseModel):
    role: str
    content: str
    image: Optional[str] = None       # Base64 data URI
    document: Optional[dict] = None    # {"name": str, "mimeType": str, "data": str}


class ChatRequest(BaseModel):
    messages: List[MessageItem]
    mode: Optional[str] = "warm_simple"
    temperature: Optional[float] = 0.7

class ImageGenRequest(BaseModel):
    prompt: str

# --- Firebase Configuration Endpoint ---
@app.get("/api/firebase-config")
async def get_firebase_config():
    raw_json = os.getenv("FIREBASE_CONFIG")
    if raw_json:
        try:
            cfg = json.loads(raw_json)
            return {"configured": True, "config": cfg}
        except Exception:
            pass

    api_key = os.getenv("FIREBASE_API_KEY")
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    if api_key and project_id:
        return {
            "configured": True,
            "config": {
                "apiKey": api_key,
                "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", f"{project_id}.firebaseapp.com"),
                "projectId": project_id,
                "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", f"{project_id}.appspot.com"),
                "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
                "appId": os.getenv("FIREBASE_APP_ID", "")
            }
        }
    return {"configured": False, "config": None}

# --- Auth Endpoints (Local Fallback) ---
@app.post("/api/auth/register")
async def register(req: AuthRequest):
    username = req.username.strip()
    password = req.password.strip()

    if len(username) < 3 or len(username) > 30:
        raise HTTPException(status_code=400, detail="Username must be between 3 and 30 characters.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    pwd_hash, salt = hash_password(password)
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
                (username, pwd_hash, salt)
            )
            user_id = cursor.lastrowid
            token = secrets.token_hex(32)
            cursor.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
            conn.commit()
            return {"success": True, "token": token, "username": username}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="This username is already taken. Please choose another one.")

@app.post("/api/auth/login")
async def login(req: AuthRequest):
    username = req.username.strip()
    password = req.password.strip()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, password_hash, salt FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        if not row or not verify_password(password, row["password_hash"], row["salt"]):
            raise HTTPException(status_code=401, detail="Invalid username or password. Please try again.")

        token = secrets.token_hex(32)
        cursor.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, row["id"]))
        conn.commit()
        return {"success": True, "token": token, "username": row["username"]}

@app.get("/api/auth/me")
async def get_current_user(authorization: Optional[str] = Header(None)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()

    user = get_user_from_token(token)
    if user:
        return {"authenticated": True, "username": user["username"]}
    return {"authenticated": False}

@app.post("/api/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()
        with get_db() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
    return {"success": True}

# --- Health Check ---
@app.get("/api/health")
async def health_check():
    has_key = bool(GEMINI_API_KEY)
    return {
        "status": "healthy",
        "app": "Chabita AI",
        "model": MODEL_NAME,
        "configured": has_key
    }

# --- Image Generation Endpoint ---
@app.post("/api/generate-image")
async def generate_image(req: ImageGenRequest):
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Please enter a description for the image.")

    seed = random.randint(100000, 999999)
    encoded = urllib.parse.quote(prompt)
    image_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true&seed={seed}&model=flux"

    return {
        "success": True,
        "prompt": prompt,
        "image_url": image_url
    }

def format_gemini_contents(messages: List[MessageItem]):
    gemini_contents = []
    for msg in messages:
        role = "model" if msg.role in ("assistant", "model") else "user"
        parts = []

        content_text = (msg.content or "").strip()
        if content_text:
            parts.append({"text": content_text})

        # Multimodal image attachment
        if msg.image and isinstance(msg.image, str):
            if msg.image.startswith("data:") and ";base64," in msg.image:
                try:
                    header, b64_data = msg.image.split(";base64,", 1)
                    mime_type = header.replace("data:", "").split(";")[0] or "image/jpeg"
                    parts.append({
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": b64_data.strip()
                        }
                    })
                except Exception as err:
                    logger.warning(f"Error parsing image part: {err}")

        # Multimodal document attachment (PDF, TXT, CSV, MD, JSON)
        if msg.document and isinstance(msg.document, dict):
            raw_doc_data = msg.document.get("data", "")
            doc_mime = msg.document.get("mimeType", "application/pdf")
            doc_name = msg.document.get("name", "document.pdf")

            if raw_doc_data:
                try:
                    if ";base64," in raw_doc_data:
                        raw_doc_data = raw_doc_data.split(";base64,", 1)[1]
                    
                    clean_b64 = raw_doc_data.strip()
                    lower_mime = (doc_mime or "").lower()
                    lower_name = (doc_name or "").lower()

                    # Text-based documents (txt, csv, md, json) are passed as text content
                    if any(t in lower_mime for t in ["text/", "csv", "json", "markdown"]) or any(lower_name.endswith(ext) for ext in [".txt", ".csv", ".md", ".json"]):
                        try:
                            decoded_str = base64.b64decode(clean_b64).decode("utf-8", errors="replace")
                            parts.append({
                                "text": f"\n\n--- Attached Document Content ({doc_name}) ---\n{decoded_str}\n--- End of Document ---\n"
                            })
                        except Exception:
                            parts.append({
                                "inlineData": {
                                    "mimeType": doc_mime,
                                    "data": clean_b64
                                }
                            })
                    else:
                        # PDF and binary formats use native Gemini inlineData
                        parts.append({
                            "inlineData": {
                                "mimeType": doc_mime or "application/pdf",
                                "data": clean_b64
                            }
                        })

                    if not content_text:
                        parts.insert(0, {"text": f"Please examine and analyze the attached document: '{doc_name}'."})
                except Exception as doc_err:
                    logger.warning(f"Error parsing document part: {doc_err}")

        if not parts:
            continue

        gemini_contents.append({
            "role": role,
            "parts": parts
        })

    if gemini_contents and gemini_contents[0]["role"] != "user":
        gemini_contents.insert(0, {"role": "user", "parts": [{"text": "Hello"}]})
    return gemini_contents

# --- Multimodal Streaming Chat Endpoint ---
@app.post("/api/chat")
async def chat_stream(request: ChatRequest):
    api_key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API Key is not configured. Please set GEMINI_API_KEY in Render environment variables."
        )

    system_instruction = MODES.get(request.mode, BASE_PERSONA)
    contents = format_gemini_contents(request.messages)

    if not contents:
        raise HTTPException(status_code=400, detail="No message content provided.")

    payload = {
        "contents": contents,
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "generationConfig": {
            "temperature": request.temperature or 0.7,
            "maxOutputTokens": 4096
        }
    }

    url = f"{BASE_GEMINI_URL}/models/{MODEL_NAME}:streamGenerateContent?alt=sse&key={api_key}"

    async def sse_generator():
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        logger.error(f"Gemini API returned status {response.status_code}: {error_body.decode(errors='ignore')}")
                        yield f"data: {json.dumps({'error': 'Oh no! I had a little hiccup connecting with the AI engine. Please verify the API key or try again in a moment.'})}\n\n"
                        yield "data: [DONE]\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data:"):
                            raw_data = line[5:].strip()
                            try:
                                data_obj = json.loads(raw_data)
                                candidates = data_obj.get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    text_chunk = "".join(p.get("text", "") for p in parts if "text" in p)
                                    if text_chunk:
                                        yield f"data: {json.dumps({'text': text_chunk})}\n\n"
                            except Exception as parse_err:
                                logger.warning(f"Failed to parse SSE chunk: {parse_err}")

            yield "data: [DONE]\n\n"

        except httpx.TimeoutException:
            yield f"data: {json.dumps({'error': 'The request timed out. Chabita is ready when you want to try again!'})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Unexpected error in chat streaming")
            yield f"data: {json.dumps({'error': f'Something unexpected happened: {str(e)}'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# Mount static files (Frontend)
public_dir = os.path.join(os.path.dirname(__file__), "public")
static_dir = os.path.join(os.path.dirname(__file__), "static")
frontend_dir = public_dir if os.path.exists(public_dir) else static_dir

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting Chabita AI on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
