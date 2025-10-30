#include "crc32.h"

static const uint32_t poly = 0xEDB88320UL;

uint32_t crc32_init() {
  return 0xFFFFFFFFUL;
}

uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t len) {
  while (len--) {
    crc ^= *data++;
    for (uint8_t i = 0; i < 8; i++) {
      crc = (crc >> 1) ^ (poly & (-(int32_t)(crc & 1)));
    }
  }
  return crc;
}

uint32_t crc32_finalize(uint32_t crc) {
  return crc ^ 0xFFFFFFFFUL;
}


