#include "config.h"
#include "bridge.h"
#include <Arduino.h>
#include <string.h>

extern HardwareSerial SerialModule;

static bool lineEq(const char* buf, size_t len, const char* a, size_t n) {
  if (len != n) return false;
  return memcmp(buf, a, n) == 0;
}

static bool lineStartsWith(const char* buf, size_t len, const char* pfx, size_t pfxLen) {
  if (len < pfxLen) return false;
  return memcmp(buf, pfx, pfxLen) == 0;
}

void usbPrint(const char* s) {
  Serial.print(s);
  Serial.flush();
}

void uartSendLine(const char* buf, size_t len) {
  for (size_t i = 0; i < len; i++)
    SerialModule.write(buf[i]);
  SerialModule.write('\n');
}

bool tryQuickAck(const char* lineBuf, size_t lineLen) {
  if (lineLen == 11 && lineEq(lineBuf, lineLen, "DIGIKEYPING", 11)) {
    usbPrint("DIGIKEYPONG\n");
    return true;
  }
  return false;
}

void handleLine(const char* lineBuf, size_t lineLen, bool* sceneState, uint32_t* sceneBytesRemaining, uint32_t* sceneBytesLastMs) {
  if (lineLen == 0) return;
  if (lineEq(lineBuf, lineLen, "DIGIKEYPING", 11)) {
    usbPrint("DIGIKEYPONG\n");
  } else if (lineEq(lineBuf, lineLen, "PING", 4)) {
    uartSendLine(lineBuf, lineLen);
  } else if (lineEq(lineBuf, lineLen, "SCENE_READY?", 12)) {
    usbPrint("SCENE_READY\n");
    uartSendLine(lineBuf, lineLen);
  } else if (lineStartsWith(lineBuf, lineLen, "SCENE_SIZE:", SCENE_SIZE_PFX_LEN) && lineLen > SCENE_SIZE_PFX_LEN && lineLen <= 21) {
    *sceneBytesRemaining = 0;
    for (size_t i = SCENE_SIZE_PFX_LEN; i < lineLen; i++) {
      if (lineBuf[i] >= '0' && lineBuf[i] <= '9')
        *sceneBytesRemaining = *sceneBytesRemaining * 10 + (lineBuf[i] - '0');
      else { *sceneBytesRemaining = 0; break; }
    }
    if (*sceneBytesRemaining > 0) {
      *sceneState = true;
      *sceneBytesLastMs = millis();
      usbPrint("SCENE_SIZE_ACK\n");
      uartSendLine(lineBuf, lineLen);
    } else {
      uartSendLine(lineBuf, lineLen);
    }
  } else if (lineStartsWith(lineBuf, lineLen, "SCENE_HASH:", SCENE_HASH_PFX_LEN) && lineLen == SCENE_HASH_PFX_LEN + SCENE_HASH_HEX_LEN) {
    usbPrint("SCENE_HASH_ACK\n");
    uartSendLine(lineBuf, lineLen);
    SerialModule.flush();
  } else if (lineEq(lineBuf, lineLen, "SYN", 3)) {
    SerialModule.print("SYN\n");
  } else if (lineStartsWith(lineBuf, lineLen, "MODULE_SEND:", MODULE_SEND_PFX_LEN) && lineLen > MODULE_SEND_PFX_LEN) {
    for (size_t i = MODULE_SEND_PFX_LEN; i < lineLen; i++)
      SerialModule.write(lineBuf[i]);
    usbPrint("MODULE_SEND_ACK\n");
  } else {
    uartSendLine(lineBuf, lineLen);
  }
}
