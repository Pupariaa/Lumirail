#include "config.h"
#include "bridge.h"
#include "bridge_util.h"
#include "pc_link.h"
#include <Arduino.h>
#include <string.h>
#include <stdio.h>

extern HardwareSerial SerialModule;

static bool lineEq(const char* buf, size_t len, const char* a, size_t n) {
  if (len != n) return false;
  return memcmp(buf, a, n) == 0;
}

static bool lineStartsWith(const char* buf, size_t len, const char* pfx, size_t pfxLen) {
  if (len < pfxLen) return false;
  return memcmp(buf, pfx, pfxLen) == 0;
}

static size_t moduleTxLen;
static size_t moduleTxIdx;
static char moduleTxBuf[MODULE_TX_BUF_SIZE];

void moduleTxReset(void) {
  moduleTxIdx = 0;
  moduleTxLen = 0;
}

bool moduleTxAppend(const uint8_t* data, size_t len) {
  if (moduleTxLen + len > sizeof(moduleTxBuf)) return false;
  memcpy(moduleTxBuf + moduleTxLen, data, len);
  moduleTxLen += len;
  return true;
}

bool moduleTxAppendStr(const char* s) {
  size_t n = strlen(s);
  if (moduleTxLen + n > sizeof(moduleTxBuf)) return false;
  memcpy(moduleTxBuf + moduleTxLen, s, n + 1);
  moduleTxLen += n;
  return true;
}

size_t moduleTxPending(void) {
  return moduleTxLen - moduleTxIdx;
}

static void (*g_usb_output)(const char*) = 0;

void bridge_set_usb_output(void (*fn)(const char*)) {
  g_usb_output = fn;
}

void usbPrint(const char* s) {
  if (g_usb_output)
    g_usb_output(s);
  else if (s)
    for (; *s; s++) PcLink.write((uint8_t)*s);
}

bool tryQuickAck(const char* lineBuf, size_t lineLen) {
  if (lineLen == 11 && lineEq(lineBuf, lineLen, "DIGIKEYPING", 11)) {
    usbPrint("DIGIKEYPONG\n");
    return true;
  }
  return false;
}

void handleLine(const char* lineBuf, size_t lineLen, bool* sceneState, uint32_t* sceneBytesRemaining,
    uint32_t* sceneLfpSize, uint32_t* sceneSendToModuleLfpSize, char* sceneSendToModuleHash) {
  if (lineLen == 0) return;
  if (lineEq(lineBuf, lineLen, "DIGIKEYPING", 11)) {
    usbPrint("DIGIKEYPONG\n");
  } else if (lineEq(lineBuf, lineLen, "PING", 4)) {
    moduleTxAppend((const uint8_t*)lineBuf, lineLen);
    moduleTxAppend((const uint8_t*)"\n", 1);
  } else if (lineEq(lineBuf, lineLen, "SCENE_READY?", 12)) {
    usbPrint("SCENE_READY\n");
    moduleTxAppend((const uint8_t*)lineBuf, lineLen);
    moduleTxAppend((const uint8_t*)"\n", 1);
  } else if (lineEq(lineBuf, lineLen, "SCENE_GET_HASH", 14)) {
  } else if (lineStartsWith(lineBuf, lineLen, SCENE_UPLOAD_START_PFX, SCENE_UPLOAD_START_PFX_LEN) && lineLen > SCENE_UPLOAD_START_PFX_LEN + 1 && lineBuf[SCENE_UPLOAD_START_PFX_LEN] == ':') {
    size_t i = SCENE_UPLOAD_START_PFX_LEN + 1;
    uint32_t totalSize = 0;
    for (; i < lineLen && lineBuf[i] >= '0' && lineBuf[i] <= '9'; i++)
      totalSize = totalSize * 10 + (lineBuf[i] - '0');
    if (i == lineLen && totalSize > 0 && totalSize <= 1024 * 1024) {
      moduleTxAppend((const uint8_t*)lineBuf, lineLen);
      moduleTxAppend((const uint8_t*)"\n", 1);
      *sceneLfpSize = totalSize;
      *sceneBytesRemaining = totalSize;
      *sceneState = true;
      char buf[64];
      snprintf(buf, sizeof(buf), "BRIDGE:UPLOAD_START size=%lu\n", (unsigned long)totalSize);
      usbPrint(buf);
    }
  } else if (lineStartsWith(lineBuf, lineLen, SCENE_SEND_TO_MODULE_PFX, SCENE_SEND_TO_MODULE_PFX_LEN) && lineLen >= (size_t)(SCENE_SEND_TO_MODULE_PFX_LEN + 64) && sceneSendToModuleHash) {
    size_t hashStart = SCENE_SEND_TO_MODULE_PFX_LEN;
    memcpy(sceneSendToModuleHash, lineBuf + hashStart, 64);
    sceneSendToModuleHash[64] = '\0';
    *sceneSendToModuleLfpSize = 1;
    usbPrint("BRIDGE:SEND_TO_MODULE\n");
  } else if (lineEq(lineBuf, lineLen, "SYN", 3)) {
    moduleTxAppend((const uint8_t*)"SYN\n", 4);
  } else if (lineStartsWith(lineBuf, lineLen, "MODULE_SEND:", MODULE_SEND_PFX_LEN) && lineLen > MODULE_SEND_PFX_LEN) {
    moduleTxAppend((const uint8_t*)(lineBuf + MODULE_SEND_PFX_LEN), lineLen - MODULE_SEND_PFX_LEN);
    usbPrint("MODULE_SEND_ACK\n");
  } else {
    moduleTxAppend((const uint8_t*)lineBuf, lineLen);
    moduleTxAppend((const uint8_t*)"\n", 1);
  }
}

void bridgeSendSceneStart(uint32_t lfpSize) {
  char line[32];
  int n = snprintf(line, sizeof(line), "SCENE_START:%lu\n", (unsigned long)lfpSize);
  if (n > 0 && (size_t)n < sizeof(line))
    moduleTxAppend((const uint8_t*)line, (size_t)n);
}

void bridgeSendSceneBlockLine(uint32_t idx, uint32_t len, const char* crcHex) {
  char line[56];
  int n = snprintf(line, sizeof(line), "SCENE_BLOCK:%lu:%lu:%s\n", (unsigned long)idx, (unsigned long)len, crcHex);
  if (n > 0 && (size_t)n < sizeof(line))
    moduleTxAppend((const uint8_t*)line, (size_t)n);
}

void bridgeSendSceneHashBinary(const uint8_t* hash32) {
  if (!hash32) return;
  moduleTxAppend((const uint8_t*)"SCENE_HASH_BIN\n", 15);
  moduleTxAppend(hash32, 32);
}

bool bridgeDrainModuleTxOne(void) {
  if (moduleTxIdx >= moduleTxLen) return false;
  if (SerialModule.availableForWrite() == 0) return false;
  SerialModule.write((uint8_t)moduleTxBuf[moduleTxIdx++]);
  if (moduleTxIdx >= moduleTxLen) {
    moduleTxIdx = 0;
    moduleTxLen = 0;
  }
  return true;
}

void bridgeDrainModuleTx(size_t maxBytes) {
  for (size_t n = 0; n < maxBytes && moduleTxIdx < moduleTxLen && SerialModule.availableForWrite() > 0; n++) {
    SerialModule.write((uint8_t)moduleTxBuf[moduleTxIdx++]);
  }
  if (moduleTxIdx >= moduleTxLen) {
    moduleTxIdx = 0;
    moduleTxLen = 0;
  }
}
