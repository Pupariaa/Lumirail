## LMS-S1-G2 API Bridge

Professional REST API bridge between JavaScript applications and the LMS-S1-G2 Rust driver.

### Architecture

```
┌──────────────┐   HTTP/REST   ┌──────────────┐   ctypes   ┌───────────────┐
│  JavaScript  │ ◄────────────► │  API Bridge  │ ◄─────────► │  Rust Driver  │
│  Application │   JSON API    │   (Python)   │   FFI/C    │    (DLL)      │
└──────────────┘               └──────────────┘            └───────────────┘
                                       │
                                       ▼
                               ┌──────────────┐
                               │   CH9102F    │
                               │ (USB-Serial) │
                               └──────────────┘
                                       │
                                       ▼
                               ┌──────────────┐
                               │ ESP32 Master │
                               │  (WROOM-32)  │
                               └──────────────┘
```

### Project Structure

```
API-Bridge/
├── src/
│   ├── server.py           # Flask REST API server
│   └── driver_wrapper.py   # Driver abstraction layer
├── requirements.txt        # Python dependencies
├── config.py              # Configuration
└── README.md
```

### Installation

```bash
# Install dependencies
pip install -r requirements.txt
```

### Usage

#### Start Server

```bash
cd src
python server.py
```

Server runs on: `http://127.0.0.1:5000`

#### Environment Variables

```bash
LMS_API_HOST=127.0.0.1      # Server host
LMS_API_PORT=5000           # Server port
LMS_API_DEBUG=false         # Debug mode
LMS_DLL_PATH=/path/to/dll   # Custom DLL path
LMS_LOG_LEVEL=INFO          # Log level
```

### API Documentation

#### Base URL
```
http://127.0.0.1:5000/api/v1
```

#### Health & Status

**Health Check**
```http
GET /api/v1/health
```

**Connection Status**
```http
GET /api/v1/status
Response: {"connected": true}
```

#### Connection Management

**Connect to Master**
```http
POST /api/v1/connection
Content-Type: application/json

{
  "port": "COM3"
}
```

**Disconnect**
```http
DELETE /api/v1/connection
```

#### Slave Management

**List Slaves**
```http
GET /api/v1/slaves
Response: {
  "slaves": [
    {
      "id": 0,
      "mac": "FC:B4:67:4E:4A:40",
      "rssi": -45,
      "state": 1,
      "paired": false
    }
  ],
  "count": 1
}
```

**Pair Slave**
```http
POST /api/v1/slaves/{id}/pair
```

**Unpair Slave**
```http
POST /api/v1/slaves/{id}/unpair
```

**Ping Slave**
```http
POST /api/v1/slaves/{id}/ping
Response: {
  "success": true,
  "slave_id": 0,
  "rtt_ms": 12
}
```

#### Commands

**Send Command**
```http
POST /api/v1/slaves/{id}/command
Content-Type: application/json

{
  "message": "LED_ON"
}
```

**Broadcast**
```http
POST /api/v1/broadcast
Content-Type: application/json

{
  "message": "RESET"
}
```

#### Statistics

**Get Stats**
```http
GET /api/v1/stats
Response: {
  "paired": 2,
  "discovered": 5,
  "sent": 150,
  "received": 148,
  "lost": 2
}
```

### Error Handling

All errors follow this format:
```json
{
  "success": false,
  "error": "Error description",
  "code": -1
}
```

**Error Codes:**
- `-1`: Invalid parameter
- `-2`: Not connected
- `-3`: Parse error
- `-4`: Communication error

### Testing

```bash
# Health check
curl http://localhost:5000/api/v1/health

# Connect
curl -X POST http://localhost:5000/api/v1/connection \
  -H "Content-Type: application/json" \
  -d '{"port":"COM3"}'

# List slaves
curl http://localhost:5000/api/v1/slaves

# Pair slave
curl -X POST http://localhost:5000/api/v1/slaves/0/pair

# Send command
curl -X POST http://localhost:5000/api/v1/slaves/0/command \
  -H "Content-Type: application/json" \
  -d '{"message":"LED_ON"}'
```

### Development

**Enable debug mode:**
```bash
export LMS_API_DEBUG=true
python src/server.py
```

**Custom DLL path:**
```bash
export LMS_DLL_PATH=/path/to/lms_s1_g2_driver.dll
python src/server.py
```

### License

© 2025 Puparia - LumiRail Project

