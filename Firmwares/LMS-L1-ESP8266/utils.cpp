#include "config.h"
#include "utils.h"
#include <bearssl/bearssl_hash.h>
#include <Arduino.h>
#include <string.h>

uint8_t hexCharToNibble(char c) {
  if (c >= '0' && c <= '9') return (uint8_t)(c - '0');
  if (c >= 'a' && c <= 'f') return (uint8_t)(c - 'a' + 10);
  if (c >= 'A' && c <= 'F') return (uint8_t)(c - 'A' + 10);
  return 0xff;
}

uint32_t parseHex32(const char* hex, size_t len) {
  uint32_t v = 0;
  for (size_t i = 0; i < len && i < 8; i++) {
    uint8_t n = hexCharToNibble(hex[i]);
    if (n == 0xff) return 0;
    v = (v << 4) | n;
  }
  return v;
}

bool hexToBytes(const char* hex, size_t hexLen, uint8_t* out, size_t outLen) {
  if (hexLen != outLen * 2) return false;
  for (size_t i = 0; i < outLen; i++) {
    uint8_t hi = hexCharToNibble(hex[i * 2]);
    uint8_t lo = hexCharToNibble(hex[i * 2 + 1]);
    if (hi == 0xff || lo == 0xff) return false;
    out[i] = (hi << 4) | lo;
  }
  return true;
}

bool lineIsSyn(const char* lineBuf, size_t lineLen) {
  if (lineLen != 3) return false;
  return lineBuf[0] == 'S' && lineBuf[1] == 'Y' && lineBuf[2] == 'N';
}

bool lineIs(const char* lineBuf, size_t lineLen, const char* s, size_t n) {
  if (lineLen != n) return false;
  return strncmp(lineBuf, s, n) == 0;
}

bool lineIsSceneReady(const char* lineBuf, size_t lineLen) {
  if (lineLen != 12) return false;
  return strncmp(lineBuf, "SCENE_READY?", 12) == 0;
}

bool lineStartsWith(const char* lineBuf, size_t lineLen, const char* pfx, size_t pfxLen) {
  if (lineLen < pfxLen) return false;
  return strncmp(lineBuf, pfx, pfxLen) == 0;
}

bool lineIsSceneDump(const char* lineBuf, size_t lineLen) {
  if (lineLen != SCENE_DUMP_CMD_LEN) return false;
  return strncmp(lineBuf, "SCENE_DUMP", SCENE_DUMP_CMD_LEN) == 0;
}

void computeFileSha256(File& f, uint8_t* out32) {
  br_sha256_context ctx;
  br_sha256_init(&ctx);
  uint8_t buf[256];
  size_t n;
  while ((n = f.read(buf, sizeof(buf))) > 0) {
    br_sha256_update(&ctx, buf, n);
    yield();
  }
  br_sha256_out(&ctx, out32);
}
