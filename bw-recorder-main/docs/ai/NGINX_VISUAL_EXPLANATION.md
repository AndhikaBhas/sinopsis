# Visual Explanation: Why Recording Fails Behind Nginx

## The Recording Flow

### ❌ BROKEN (Current Setup)

```
User clicks "Mulai Rapat" (START RECORDING)
         ↓
Browser starts recording audio
         ↓
[Records for 5 seconds]
         ↓
User clicks "Selesai Rapat" (FINISH RECORDING)
         ↓
Browser creates FormData with audio blob
         ↓
Browser: fetch("/upload-audio", {method: "POST", body: formData})
         ↓
REQUEST: Browser → Nginx → Backend
                    ✅ Forwarded
         ↓
NGINX PROBLEM: Connection: keep-alive (wrong headers)
              HTTP/1.0 (old protocol)
              └─→ Nginx thinks: "I'll close this after response"
         ↓
Backend receives request
         ↓
Backend: Response 201 Created
         ↓
DISASTER: Backend sends response → Nginx → Browser?
          
          ❌ CONNECTION ALREADY CLOSED BY NGINX
         ↓
Browser: Waiting... waiting... waiting...
         
         ⏳ 30 seconds timeout
         ↓
Browser: ❌ ERROR: "fetch failed" / "ERR_INCOMPLETE_RESPONSE"
         ↓
User sees: "Recording... (hanging)" → eventually error
```

## The Problem in Detail

```
Normal HTTP/1.1 Connection Flow:
┌─────────────────────────────────────────────────────┐
│ Client                                              │
│ (Browser)                                           │
│ - Opening connection                                │
│ - Sending request                                   │
│ - WAITING for response...                          │
└─────────────────────────────────────────────────────┘
              ↑                    ↓
              │ Request           │
              │ (multipart/form   │
              │  with audio)      │ Waiting...
              │                   │
        ┌─────────────────────────────────────────────────────┐
        │ Nginx (Reverse Proxy)                               │
        │ - Receives request ✅                               │
        │ - Forwards to backend                               │
        │ - PROBLEM: Closes connection! ❌                    │
        │ - Backend response never makes it back              │
        └─────────────────────────────────────────────────────┘
              ↑                    ↓
              │ Forwarded          │ Response
              │                    │ ❌ Lost!
              │                    │
        ┌─────────────────────────────────────────────────────┐
        │ Backend (React Router)                              │
        │ - Processes upload ✅                               │
        │ - Sends response back ✅                            │
        │ - Response dies at Nginx → never reaches browser    │
        └─────────────────────────────────────────────────────┘

Result: Browser ⏳ 30s timeout → ❌ ERROR
```

## ✅ FIXED (With Proper Config)

```
User clicks "Mulai Rapat"
         ↓
Browser starts recording audio
         ↓
[Records for 5 seconds]
         ↓
User clicks "Selesai Rapat"
         ↓
Browser creates FormData with audio blob
         ↓
Browser: fetch("/upload-audio", {method: "POST", body: formData})
         ↓
REQUEST: Browser → Nginx → Backend
                    ✅ Forwarded
                    ✅ HTTP/1.1
                    ✅ Connection: ""
         ↓
Nginx: "I'll keep this connection open and pass everything through"
       Uses HTTP/1.1 persistent connections
       Doesn't close after first response
         ↓
Backend receives request ✅
         ↓
Backend processes upload ✅
         ↓
Backend: Response 201 Created
         ↓
Response: Backend → Nginx → Browser ✅ SUCCESS
         ↓
Browser receives response ✅
         ↓
Browser: ✅ Upload completed!
         ↓
Frontend: Redirect to /rapat with uploadJobId
         ↓
User sees: Rapat created successfully ✅
```

## The Key Difference

### Missing in Original Config:
```nginx
location / {
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Host $host;
    proxy_pass http://10.252.178.50:3000;
    
    # ❌ Missing: Connection handling
    # ❌ Missing: HTTP version specification
    # ❌ Missing: Protocol forwarding
    # ❌ Missing: Timeouts
    # ❌ Missing: Body header preservation
}
```

Nginx DEFAULTS to:
- `HTTP/1.0` protocol (uses `Connection: close`)
- Closes connection after each request
- Doesn't preserve some headers

### Added in Fixed Config:
```nginx
location / {
    # Standard headers (already there)
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    
    # ✅ NEW: Proper connection handling
    proxy_set_header Connection "";         ← Allow persistent connections
    proxy_http_version 1.1;                 ← Use HTTP/1.1 protocol
    proxy_set_header Upgrade $http_upgrade; ← Support protocol upgrades
    
    # ✅ NEW: Preserve headers
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    
    # ✅ NEW: Timeouts for long operations
    proxy_read_timeout 300s;
    
    # ✅ NEW: Don't buffer (preserve streams)
    proxy_buffering off;
    
    proxy_pass http://10.252.178.50:3000;
}
```

## Request Timeline

### ❌ BROKEN (30+ seconds)
```
[T=0s] Browser sends fetch("/upload-audio") request
[T=0s] Nginx receives request
[T=0s] Nginx forwards to backend
[T=0-5s] Backend processes audio upload
[T=5s] Backend sends response "201 Created"
[T=5s] Nginx receives response
[T=5s] Nginx CLOSES CONNECTION ❌ (HTTP/1.0 behavior)
[T=5s] Browser STILL WAITING for response
[T=10s] Browser: "Still waiting..."
[T=20s] Browser: "Still waiting..."
[T=30s] Browser: "TIMEOUT ERROR" ❌
```

### ✅ FIXED (2-3 seconds)
```
[T=0s] Browser sends fetch("/upload-audio") request
[T=0s] Nginx receives request
[T=0s] Nginx forwards to backend (HTTP/1.1)
[T=0-1s] Backend processes audio upload
[T=1s] Backend sends response "201 Created"
[T=1s] Nginx receives response
[T=1s] Nginx forwards response back to browser ✅
[T=1s] Browser receives response ✅
[T=1-2s] Browser processes response
[T=2s] Recording complete! ✅
```

## The Headers Explained

### `proxy_set_header Connection "";`
- **What it does**: Clears any forced `Connection: close` header
- **Result**: Allows HTTP/1.1 keep-alive to work
- **Why needed**: Without this, Nginx defaults to closing connections

### `proxy_http_version 1.1;`
- **What it does**: Tells Nginx to use HTTP/1.1 instead of 1.0
- **Result**: Supports persistent connections natively
- **Why needed**: HTTP/1.0 closes connections by default

### Together:
```
Connection: ""  +  HTTP/1.1  =  Persistent connection ✅
                                 Response comes back ✅
                                 Recording works ✅
```

---

## Summary

| Aspect | Broken | Fixed |
|--------|--------|-------|
| HTTP Version | 1.0 | 1.1 |
| Connection Strategy | Close after each request | Keep alive |
| Recording Result | Hangs forever ⏳ | Works in 2s ✅ |
| Upload Result | Fails ❌ | Works ✅ |
| Authentication | Cookies lost ❌ | Cookies preserved ✅ |

**The fix is just two lines that dramatically change how Nginx handles connections.**
