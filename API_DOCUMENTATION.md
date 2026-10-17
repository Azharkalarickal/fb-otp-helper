# Facebook OTP Automation API Documentation

A lightweight, real-time API service that polls Hostinger IMAP mailboxes for incoming Facebook verification emails and extracts the confirmation OTP and login verification links.

---

## 📌 Endpoint Overview

| Property | Value |
| :--- | :--- |
| **Endpoint URL** | `https://fb-otp-helper.onrender.com/api/get-fb-otp` |
| **HTTP Method** | `POST` |
| **Content-Type** | `application/json` |
| **CORS** | Enabled (Accessible from any browser domain or backend) |
| **Timeout Window** | Up to 120 seconds (long-polling) |

---

## 📤 1. Request Specification

### Headers
```http
Content-Type: application/json
```

### Request Body
Send a JSON payload containing the target email address submitted to Facebook:

```json
{
  "email": "alexanderwright@qudraw.com"
}
```

#### Parameters:
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `email` | `string` | **Yes** | The exact email address submitted in the Facebook registration form. |

---

## 📥 2. Response Specification

### A. Success Response (`200 OK`)
Returned as soon as the Facebook verification email arrives and the OTP is extracted:

```json
{
  "success": true,
  "email": "alexanderwright@qudraw.com",
  "otp": "40003",
  "confirmUrl": "https://www.facebook.com/n/?confirmemail.php&c=40003...",
  "timestamp": "2026-10-17T08:46:58.816Z"
}
```

#### Response Fields:
| Field | Type | Description |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` indicates OTP was successfully found and parsed. |
| `email` | `string` | The email address queried. |
| `otp` | `string` | **The 5-digit Facebook confirmation code** (e.g., `"40003"`). |
| `confirmUrl` | `string \| null` | Direct one-click confirmation link if provided in the email. |
| `timestamp` | `string` | ISO timestamp of the response. |

---

### B. Error Response (`400 Bad Request`)
Returned if the `email` field is missing or empty:

```json
{
  "success": false,
  "error": "Email parameter is required"
}
```

---

### C. Timeout / Failure Response (`500 Internal Server Error`)
Returned if Facebook fails to deliver the verification email within 2 minutes:

```json
{
  "success": false,
  "error": "Timeout: Facebook verification email not received within time limit."
}
```

---

## 🔄 3. Recommended Automation Flow

Follow this sequence to ensure zero race conditions:

```
[Your Automation / Web Script]
   │
   ├─► 1. Fill registration form on Facebook using your domain email (e.g. user@qudraw.com)
   ├─► 2. Click "Sign Up" / "Send Code" on Facebook
   │
   ├─► 3. IMMEDIATELY send POST request to https://fb-otp-helper.onrender.com/api/get-fb-otp
   │      (The API will hold the connection and poll Hostinger until the email lands)
   │
   ├─► 4. Receive { "success": true, "otp": "..." }
   │
   └─► 5. Type the received OTP into the Facebook code verification field
```

> **Important:** Set the HTTP request timeout on your client to at least **120 seconds** (2 minutes) to allow sufficient time for Facebook's mail servers to deliver the message.

---

## 💻 4. Code Integration Examples

### JavaScript / Node.js (Fetch API)
```javascript
async function fetchFacebookOtp(email) {
  const url = 'https://fb-otp-helper.onrender.com/api/get-fb-otp';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    });

    const data = await response.json();

    if (data.success && data.otp) {
      console.log('✅ Received Facebook OTP:', data.otp);
      return data.otp; // Use this in your automation
    } else {
      throw new Error(data.error || 'Failed to retrieve OTP');
    }
  } catch (error) {
    console.error('Error fetching OTP:', error.message);
    throw error;
  }
}

// Example usage:
// const otp = await fetchFacebookOtp('alexanderwright@qudraw.com');
```

---

### Python (Requests)
```python
import requests

def get_facebook_otp(email: str) -> str:
    url = "https://fb-otp-helper.onrender.com/api/get-fb-otp"
    headers = {"Content-Type": "application/json"}
    payload = {"email": email}

    print(f"[*] Requesting OTP for {email}...")
    
    # Set timeout to 130s to allow for server-side polling
    response = requests.post(url, json=payload, headers=headers, timeout=130)
    data = response.json()

    if data.get("success") and data.get("otp"):
        otp = data["otp"]
        print(f"[+] Successfully retrieved OTP: {otp}")
        return otp
    else:
        error_msg = data.get("error", "Unknown error")
        raise Exception(f"Failed to get OTP: {error_msg}")

# Example usage:
# otp = get_facebook_otp("alexanderwright@qudraw.com")
```

---

### cURL (CLI Testing)
```bash
curl -X POST https://fb-otp-helper.onrender.com/api/get-fb-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"alexanderwright@qudraw.com"}'
```

---

## 🩺 5. Health Check Endpoint

Use this endpoint to verify that the service is running and awake:

* **Endpoint:** `GET https://fb-otp-helper.onrender.com/api/health`
* **Response:**
```json
{
  "status": "ok",
  "time": "2026-10-17T08:46:58.816Z"
}
```

> **Tip:** You can set up a free scheduled ping on [cron-job.org](https://cron-job.org) hitting the `/api/health` endpoint every 10 minutes to prevent Render free-tier spin down.
