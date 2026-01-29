#include "config.h"
#include "crc_hash.h"

#define CRC32_POLY 0xEDB88320UL

const char hexTab[] = "0123456789abcdef";
static uint32_t crc32_table[256];
static uint8_t crc32_init_done;

void crc32_init(void) {
  for (uint32_t i = 0; i < 256; i++) {
    uint32_t c = i;
    for (int j = 0; j < 8; j++) {
      c = (c & 1) ? (CRC32_POLY ^ (c >> 1)) : (c >> 1);
    }
    crc32_table[i] = c;
  }
  crc32_init_done = 1;
}

uint32_t crc32_update(uint32_t crc, const uint8_t* p, size_t n) {
  if (!crc32_init_done) crc32_init();
  for (; n; n--, p++)
    crc = crc32_table[(crc ^ *p) & 0xff] ^ (crc >> 8);
  return crc;
}

uint32_t crc32_final(uint32_t crc) {
  return crc ^ 0xffffffffUL;
}

void crc32_to_hex8(uint32_t crc, char* out8) {
  for (int i = 0; i < 8; i++) {
    out8[i] = hexTab[(crc >> (28 - i * 4)) & 0x0f];
  }
  out8[8] = '\0';
}

void sha256_hex(const uint8_t* h, char* out64) {
  for (int i = 0; i < 32; i++) {
    out64[i * 2] = hexTab[h[i] >> 4];
    out64[i * 2 + 1] = hexTab[h[i] & 0x0f];
  }
  out64[64] = '\0';
}
