#include "bridge_util.h"
#include <Arduino.h>
#if USE_SPIFFS
#include <SPIFFS.h>
#else
#include <LittleFS.h>
#endif
#include <mbedtls/sha256.h>
#include <string.h>

#define CRC32_POLY 0xEDB88320UL

static const char hexTab[] = "0123456789abcdef";
static uint32_t crc32_table[256];
static uint8_t crc32_init_done;

static void crc32_init(void) {
  for (uint32_t i = 0; i < 256; i++) {
    uint32_t c = i;
    for (int j = 0; j < 8; j++)
      c = (c & 1) ? (CRC32_POLY ^ (c >> 1)) : (c >> 1);
    crc32_table[i] = c;
  }
  crc32_init_done = 1;
}

uint32_t bridge_crc32_update(uint32_t crc, const uint8_t* p, size_t n) {
  if (!crc32_init_done) crc32_init();
  for (; n; n--, p++)
    crc = crc32_table[(crc ^ *p) & 0xff] ^ (crc >> 8);
  return crc;
}

uint32_t bridge_crc32_final(uint32_t crc) {
  return crc ^ 0xffffffffUL;
}

void bridge_crc32_to_hex8(uint32_t crc, char* out8) {
  for (int i = 0; i < 8; i++)
    out8[i] = hexTab[(crc >> (28 - i * 4)) & 0x0f];
  out8[8] = '\0';
}

uint8_t bridge_hex_char_to_nibble(char c) {
  if (c >= '0' && c <= '9') return (uint8_t)(c - '0');
  if (c >= 'a' && c <= 'f') return (uint8_t)(c - 'a' + 10);
  if (c >= 'A' && c <= 'F') return (uint8_t)(c - 'A' + 10);
  return 0xff;
}

uint32_t bridge_parse_hex32(const char* hex, size_t len) {
  uint32_t v = 0;
  for (size_t i = 0; i < len && i < 8; i++) {
    uint8_t n = bridge_hex_char_to_nibble(hex[i]);
    if (n == 0xff) return 0;
    v = (v << 4) | n;
  }
  return v;
}

static mbedtls_sha256_context g_sha256_ctx;
static uint8_t g_sha256_active;

bool bridge_compute_file_sha256(File& f, uint8_t* out32) {
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  if (mbedtls_sha256_starts(&ctx, 0) != 0) {
    mbedtls_sha256_free(&ctx);
    return false;
  }
  uint8_t buf[256];
  size_t n;
  while ((n = f.read(buf, sizeof(buf))) > 0) {
    if (mbedtls_sha256_update(&ctx, buf, n) != 0) {
      mbedtls_sha256_free(&ctx);
      return false;
    }
  }
  if (mbedtls_sha256_finish(&ctx, out32) != 0) {
    mbedtls_sha256_free(&ctx);
    return false;
  }
  mbedtls_sha256_free(&ctx);
  return true;
}

bool bridge_sha256_start(void) {
  if (g_sha256_active) return false;
  mbedtls_sha256_init(&g_sha256_ctx);
  if (mbedtls_sha256_starts(&g_sha256_ctx, 0) != 0) {
    mbedtls_sha256_free(&g_sha256_ctx);
    return false;
  }
  g_sha256_active = 1;
  return true;
}

bool bridge_sha256_update(const uint8_t* buf, size_t len) {
  if (!g_sha256_active || !buf) return false;
  return mbedtls_sha256_update(&g_sha256_ctx, buf, len) == 0;
}

bool bridge_sha256_finish(uint8_t* out32) {
  if (!g_sha256_active || !out32) return false;
  if (mbedtls_sha256_finish(&g_sha256_ctx, out32) != 0) {
    mbedtls_sha256_free(&g_sha256_ctx);
    g_sha256_active = 0;
    return false;
  }
  mbedtls_sha256_free(&g_sha256_ctx);
  g_sha256_active = 0;
  return true;
}

void bridge_sha256_abort(void) {
  if (g_sha256_active) {
    mbedtls_sha256_free(&g_sha256_ctx);
    g_sha256_active = 0;
  }
}

void bridge_sha256_to_hex64(const uint8_t* h, char* out64) {
  for (int i = 0; i < 32; i++) {
    out64[i * 2] = hexTab[h[i] >> 4];
    out64[i * 2 + 1] = hexTab[h[i] & 0x0f];
  }
  out64[64] = '\0';
}

bool bridge_hex64_to_bytes(const char* hex, uint8_t* out32) {
  for (int i = 0; i < 32; i++) {
    uint8_t hi = bridge_hex_char_to_nibble(hex[i * 2]);
    uint8_t lo = bridge_hex_char_to_nibble(hex[i * 2 + 1]);
    if (hi == 0xff || lo == 0xff) return false;
    out32[i] = (hi << 4) | lo;
  }
  return true;
}
