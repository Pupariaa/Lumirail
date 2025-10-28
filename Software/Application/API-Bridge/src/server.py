"""
LMS-S1-G2 API Server
REST API bridge between JavaScript application and Rust driver
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from driver_wrapper import DriverWrapper, DriverError
import logging
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Global driver instance
driver: DriverWrapper = None


def init_driver():
    """Initialize the driver wrapper"""
    global driver
    try:
        driver = DriverWrapper()
        logger.info("Driver initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize driver: {e}")
        driver = None


@app.errorhandler(DriverError)
def handle_driver_error(error):
    """Handle driver-specific errors"""
    return jsonify({
        "success": False,
        "error": error.message,
        "code": error.code
    }), 400


@app.errorhandler(Exception)
def handle_generic_error(error):
    """Handle generic errors"""
    logger.error(f"Unhandled error: {error}", exc_info=True)
    return jsonify({
        "success": False,
        "error": str(error)
    }), 500


# ============================================================================
# Health & Status Endpoints
# ============================================================================

@app.route('/api/v1/health', methods=['GET'])
def health_check():
    """System health check"""
    return jsonify({
        "status": "healthy",
        "driver": "loaded" if driver else "unavailable"
    })


@app.route('/api/v1/status', methods=['GET'])
def get_status():
    """Get connection status"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    return jsonify({
        "connected": driver.is_connected()
    })


# ============================================================================
# Connection Endpoints
# ============================================================================

@app.route('/api/v1/connection', methods=['POST'])
def connect():
    """Establish connection to Master device"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    data = request.get_json()
    if not data or 'port' not in data:
        return jsonify({"error": "Missing 'port' parameter"}), 400
    
    port = data['port']
    driver.connect(port)
    
    logger.info(f"Connected to {port}")
    return jsonify({
        "success": True,
        "message": f"Connected to {port}"
    })


@app.route('/api/v1/connection', methods=['DELETE'])
def disconnect():
    """Disconnect from Master device"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    driver.disconnect()
    logger.info("Disconnected")
    
    return jsonify({
        "success": True,
        "message": "Disconnected"
    })


# ============================================================================
# Slave Management Endpoints
# ============================================================================

@app.route('/api/v1/slaves', methods=['GET'])
def get_slaves():
    """List all discovered slaves"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    slaves = driver.list_slaves()
    
    return jsonify({
        "slaves": slaves,
        "count": len(slaves)
    })


@app.route('/api/v1/slaves/<int:slave_id>/pair', methods=['POST'])
def pair_slave(slave_id):
    """Pair with a specific slave"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    driver.pair_slave(slave_id)
    logger.info(f"Paired with slave {slave_id}")
    
    return jsonify({
        "success": True,
        "message": f"Slave {slave_id} paired successfully"
    })


@app.route('/api/v1/slaves/<int:slave_id>/unpair', methods=['POST'])
def unpair_slave(slave_id):
    """Unpair a specific slave"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    driver.unpair_slave(slave_id)
    logger.info(f"Unpaired slave {slave_id}")
    
    return jsonify({
        "success": True,
        "message": f"Slave {slave_id} unpaired successfully"
    })


@app.route('/api/v1/slaves/<int:slave_id>/ping', methods=['POST'])
def ping_slave(slave_id):
    """Ping a specific slave"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    rtt = driver.ping_slave(slave_id)
    logger.info(f"Pinged slave {slave_id}: {rtt}ms")
    
    return jsonify({
        "success": True,
        "slave_id": slave_id,
        "rtt_ms": rtt
    })


# ============================================================================
# Command Endpoints
# ============================================================================

@app.route('/api/v1/slaves/<int:slave_id>/command', methods=['POST'])
def send_command(slave_id):
    """Send command to a specific slave"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({"error": "Missing 'message' parameter"}), 400
    
    message = data['message']
    driver.send_command(slave_id, message)
    logger.info(f"Sent command to slave {slave_id}: {message}")
    
    return jsonify({
        "success": True,
        "message": f"Command sent to slave {slave_id}"
    })


@app.route('/api/v1/broadcast', methods=['POST'])
def broadcast():
    """Broadcast message to all paired slaves"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({"error": "Missing 'message' parameter"}), 400
    
    message = data['message']
    driver.broadcast(message)
    logger.info(f"Broadcasted message: {message}")
    
    return jsonify({
        "success": True,
        "message": "Broadcast sent successfully"
    })


# ============================================================================
# Statistics Endpoints
# ============================================================================

@app.route('/api/v1/stats', methods=['GET'])
def get_statistics():
    """Get system statistics"""
    if not driver:
        return jsonify({"error": "Driver unavailable"}), 503
    
    stats = driver.get_stats()
    
    return jsonify(stats)


# ============================================================================
# Server Entry Point
# ============================================================================

def main():
    """Main server entry point"""
    print("=" * 60)
    print("LMS-S1-G2 API Bridge Server")
    print("=" * 60)
    
    init_driver()
    
    if not driver:
        logger.warning("Server starting without driver (limited functionality)")
    
    logger.info("Starting server on http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=False)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
        if driver:
            driver.cleanup()
        sys.exit(0)

