"""
LMS-S1-G2 Driver Wrapper
Handles communication with the Rust DLL driver
"""

import ctypes
from pathlib import Path
from typing import List, Dict, Optional


class CSlaveInfo(ctypes.Structure):
    """C-compatible Slave structure"""
    _fields_ = [
        ("id", ctypes.c_uint8),
        ("mac", ctypes.c_uint8 * 6),
        ("rssi", ctypes.c_int32),
        ("state", ctypes.c_uint8),
        ("paired", ctypes.c_uint8),
    ]


class CStats(ctypes.Structure):
    """C-compatible Statistics structure"""
    _fields_ = [
        ("paired", ctypes.c_uint8),
        ("discovered", ctypes.c_uint8),
        ("sent", ctypes.c_uint32),
        ("received", ctypes.c_uint32),
        ("lost", ctypes.c_uint32),
    ]


class DriverError(Exception):
    """Driver-specific exception"""
    ERROR_CODES = {
        -1: "Invalid parameter or null pointer",
        -2: "Not initialized or not connected",
        -3: "Parse error or invalid data",
        -4: "Communication error",
    }
    
    def __init__(self, code: int, message: str = ""):
        self.code = code
        self.message = message or self.ERROR_CODES.get(code, f"Unknown error: {code}")
        super().__init__(self.message)


class DriverWrapper:
    """
    Wrapper for LMS-S1-G2 Rust DLL
    Provides Python-friendly interface to the native driver
    """
    
    def __init__(self, dll_path: Optional[Path] = None):
        self.dll = None
        self._load_dll(dll_path)
        self._setup_function_signatures()
        self._initialize()
    
    def _load_dll(self, dll_path: Optional[Path] = None):
        """Load the Rust DLL"""
        if dll_path and dll_path.exists():
            search_paths = [dll_path]
        else:
            # Auto-detect DLL locations
            base_path = Path(__file__).parent.parent.parent.parent
            search_paths = [
                base_path / "Driver" / "LMS-S1-G2" / "target" / "release" / "lms_s1_g2_driver.dll",
                Path("lms_s1_g2_driver.dll"),
            ]
        
        for path in search_paths:
            if path.exists():
                try:
                    self.dll = ctypes.CDLL(str(path))
                    print(f"✓ Driver loaded: {path}")
                    return
                except Exception as e:
                    print(f"✗ Failed to load {path}: {e}")
        
        raise FileNotFoundError("Could not locate lms_s1_g2_driver.dll")
    
    def _setup_function_signatures(self):
        """Configure ctypes function signatures"""
        # Initialization
        self.dll.lms_s1_g2_init.restype = ctypes.c_int
        self.dll.lms_s1_g2_cleanup.restype = None
        
        # Connection
        self.dll.lms_s1_g2_connect.argtypes = [ctypes.c_char_p]
        self.dll.lms_s1_g2_connect.restype = ctypes.c_int
        self.dll.lms_s1_g2_disconnect.restype = None
        self.dll.lms_s1_g2_is_connected.restype = ctypes.c_int
        
        # Slave Management
        self.dll.lms_s1_g2_list_slaves.argtypes = [ctypes.POINTER(CSlaveInfo), ctypes.c_size_t]
        self.dll.lms_s1_g2_list_slaves.restype = ctypes.c_int
        
        self.dll.lms_s1_g2_pair_slave.argtypes = [ctypes.c_uint8]
        self.dll.lms_s1_g2_pair_slave.restype = ctypes.c_int
        
        self.dll.lms_s1_g2_unpair_slave.argtypes = [ctypes.c_uint8]
        self.dll.lms_s1_g2_unpair_slave.restype = ctypes.c_int
        
        self.dll.lms_s1_g2_ping_slave.argtypes = [ctypes.c_uint8]
        self.dll.lms_s1_g2_ping_slave.restype = ctypes.c_int
        
        # Commands
        self.dll.lms_s1_g2_send_command.argtypes = [ctypes.c_uint8, ctypes.c_char_p]
        self.dll.lms_s1_g2_send_command.restype = ctypes.c_int
        
        self.dll.lms_s1_g2_broadcast.argtypes = [ctypes.c_char_p]
        self.dll.lms_s1_g2_broadcast.restype = ctypes.c_int
        
        # Statistics
        self.dll.lms_s1_g2_get_stats.argtypes = [ctypes.POINTER(CStats)]
        self.dll.lms_s1_g2_get_stats.restype = ctypes.c_int
    
    def _initialize(self):
        """Initialize the driver"""
        result = self.dll.lms_s1_g2_init()
        if result != 0:
            raise DriverError(result, "Failed to initialize driver")
        print("✓ Driver initialized")
    
    def connect(self, port: str) -> None:
        """Connect to Master device via serial port"""
        result = self.dll.lms_s1_g2_connect(port.encode('utf-8'))
        if result != 0:
            raise DriverError(result, f"Failed to connect to {port}")
    
    def disconnect(self) -> None:
        """Disconnect from Master device"""
        self.dll.lms_s1_g2_disconnect()
    
    def is_connected(self) -> bool:
        """Check if connected to Master device"""
        return self.dll.lms_s1_g2_is_connected() == 1
    
    def list_slaves(self, max_count: int = 32) -> List[Dict]:
        """List all discovered slaves"""
        slaves_array = (CSlaveInfo * max_count)()
        count = self.dll.lms_s1_g2_list_slaves(slaves_array, max_count)
        
        if count < 0:
            raise DriverError(count, "Failed to list slaves")
        
        slaves = []
        for i in range(count):
            slave = slaves_array[i]
            slaves.append({
                "id": slave.id,
                "mac": ":".join(f"{b:02X}" for b in slave.mac),
                "rssi": slave.rssi,
                "state": slave.state,
                "paired": slave.paired == 1
            })
        
        return slaves
    
    def pair_slave(self, slave_id: int) -> None:
        """Pair with a specific slave"""
        result = self.dll.lms_s1_g2_pair_slave(slave_id)
        if result != 0:
            raise DriverError(result, f"Failed to pair slave {slave_id}")
    
    def unpair_slave(self, slave_id: int) -> None:
        """Unpair a specific slave"""
        result = self.dll.lms_s1_g2_unpair_slave(slave_id)
        if result != 0:
            raise DriverError(result, f"Failed to unpair slave {slave_id}")
    
    def ping_slave(self, slave_id: int) -> int:
        """Ping a slave and return RTT in milliseconds"""
        result = self.dll.lms_s1_g2_ping_slave(slave_id)
        if result < 0:
            raise DriverError(result, f"Failed to ping slave {slave_id}")
        return result
    
    def send_command(self, slave_id: int, message: str) -> None:
        """Send a command to a specific slave"""
        result = self.dll.lms_s1_g2_send_command(slave_id, message.encode('utf-8'))
        if result != 0:
            raise DriverError(result, f"Failed to send command to slave {slave_id}")
    
    def broadcast(self, message: str) -> None:
        """Broadcast a message to all paired slaves"""
        result = self.dll.lms_s1_g2_broadcast(message.encode('utf-8'))
        if result != 0:
            raise DriverError(result, "Failed to broadcast message")
    
    def get_stats(self) -> Dict:
        """Get system statistics"""
        stats = CStats()
        result = self.dll.lms_s1_g2_get_stats(ctypes.byref(stats))
        
        if result != 0:
            raise DriverError(result, "Failed to retrieve statistics")
        
        return {
            "paired": stats.paired,
            "discovered": stats.discovered,
            "sent": stats.sent,
            "received": stats.received,
            "lost": stats.lost
        }
    
    def cleanup(self):
        """Cleanup driver resources"""
        if self.dll:
            self.dll.lms_s1_g2_cleanup()
            print("✓ Driver cleaned up")

