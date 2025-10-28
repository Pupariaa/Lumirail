"""
Configuration for LMS-S1-G2 API Bridge
"""

import os
from pathlib import Path

# Server Configuration
SERVER_HOST = os.getenv('LMS_API_HOST', '127.0.0.1')
SERVER_PORT = int(os.getenv('LMS_API_PORT', 5000))
DEBUG_MODE = os.getenv('LMS_API_DEBUG', 'false').lower() == 'true'

# Driver Configuration
DLL_PATH = os.getenv('LMS_DLL_PATH', None)
MAX_SLAVES = 32

# Logging Configuration
LOG_LEVEL = os.getenv('LMS_LOG_LEVEL', 'INFO')
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

# API Configuration
API_VERSION = 'v1'
API_PREFIX = f'/api/{API_VERSION}'

