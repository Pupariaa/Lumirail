#include "config.h"
#include "serial_protocol.h"
#include "crc_hash.h"
#include <LittleFS.h>
#include <bearssl/bearssl_hash.h>
#include <Arduino.h>
#include <string.h>
#include <stdio.h>

static const char CONF_LN[] = "CONF_LN";
static const char BOARD_LN[] = "BOARD_LN";
static const char S1MT_LN[] = "S1MT_LN";
static const char S2MT_LN[] = "S2MT_LN";

void sendLine(const char* s) {
  Serial.print(s);
  Serial.print("\r\n");
}

bool waitForLineAck(const char* ack, size_t ackLen) {
  char buf[32];
  size_t idx = 0;
  unsigned long deadline = millis() + LINE_ACK_TIMEOUT_MS;
  while (millis() < deadline) {
    while (Serial.available() && idx < sizeof(buf) - 1) {
      int c = Serial.read();
      if (c < 0) break;
      if (c == '\r') continue;
      if (c == '\n') {
        buf[idx] = '\0';
        if (idx == ackLen && memcmp(buf, ack, ackLen) == 0) return true;
        idx = 0;
      } else {
        buf[idx++] = (char)c;
      }
    }
    delay(1);
  }
  return false;
}

static void emitBlockEnd(uint32_t crc, const uint8_t* h, const char* endPrefix) {
  char hex64[65];
  sha256_hex(h, hex64);
  Serial.print(endPrefix);
  Serial.print(":");
  for (int i = 3; i >= 0; i--) {
    uint8_t b = (uint8_t)((crc >> (i * 8)) & 0xff);
    Serial.print(hexTab[b >> 4]);
    Serial.print(hexTab[b & 0x0f]);
  }
  Serial.print(":");
  Serial.print(hex64);
  Serial.print("\r\n");
  Serial.flush();
}

void sendFileLinesWithHash(const char* path, const char* endPrefix, const char* lineAck, size_t lineAckLen) {
  br_sha256_context sha;
  br_sha256_init(&sha);
  uint32_t crc = 0xffffffffUL;
  if (LittleFS.exists(path)) {
    File f = LittleFS.open(path, "r");
    if (f) {
      char ln[96];
      size_t idx = 0;
      while (f.available()) {
        int c = f.read();
        if (c < 0) break;
        if (c == '\r') continue;
        if (c == '\n') {
          if (idx > 0) {
            ln[idx] = '\0';
            while (idx > 0 && (ln[idx - 1] == ' ' || ln[idx - 1] == '\t')) ln[--idx] = '\0';
            if (idx > 0) {
              size_t coli = 0;
              while (ln[coli] && ln[coli] != ':') coli++;
              if (ln[coli] == ':') {
                crc = crc32_update(crc, (const uint8_t*)ln, idx);
                crc = crc32_update(crc, (const uint8_t*)"\n", 1);
                br_sha256_update(&sha, (const void*)ln, idx);
                br_sha256_update(&sha, (const void*)"\n", 1);
                Serial.print(ln);
                Serial.print("\r\n");
                Serial.flush();
                if (!waitForLineAck(lineAck, lineAckLen)) return;
              }
            }
            idx = 0;
          }
        } else {
          if (idx < sizeof(ln) - 1) ln[idx++] = (char)c;
        }
      }
      if (idx > 0) {
        ln[idx] = '\0';
        while (idx > 0 && (ln[idx - 1] == ' ' || ln[idx - 1] == '\t')) ln[--idx] = '\0';
        if (idx > 0) {
          size_t coli = 0;
          while (ln[coli] && ln[coli] != ':') coli++;
          if (ln[coli] == ':') {
            crc = crc32_update(crc, (const uint8_t*)ln, idx);
            crc = crc32_update(crc, (const uint8_t*)"\n", 1);
            br_sha256_update(&sha, (const void*)ln, idx);
            br_sha256_update(&sha, (const void*)"\n", 1);
            Serial.print(ln);
            Serial.print("\r\n");
            Serial.flush();
            if (!waitForLineAck(lineAck, lineAckLen)) return;
          }
        }
      }
      f.close();
    }
  }
  crc = crc32_final(crc);
  uint8_t h[32];
  br_sha256_out(&sha, h);
  emitBlockEnd(crc, h, endPrefix);
}

void sendFileBlock(const char* path, const char* endPrefix) {
  br_sha256_context sha;
  br_sha256_init(&sha);
  uint32_t crc = 0xffffffffUL;
  if (LittleFS.exists(path)) {
    File f = LittleFS.open(path, "r");
    if (f) {
      char ln[96];
      size_t idx = 0;
      while (f.available()) {
        int c = f.read();
        if (c < 0) break;
        if (c == '\r') continue;
        if (c == '\n') {
          if (idx > 0) {
            ln[idx] = '\0';
            while (idx > 0 && (ln[idx - 1] == ' ' || ln[idx - 1] == '\t')) ln[--idx] = '\0';
            if (idx > 0) {
              size_t coli = 0;
              while (ln[coli] && ln[coli] != ':') coli++;
              if (ln[coli] == ':') {
                crc = crc32_update(crc, (const uint8_t*)ln, idx);
                crc = crc32_update(crc, (const uint8_t*)"\n", 1);
                br_sha256_update(&sha, (const void*)ln, idx);
                br_sha256_update(&sha, (const void*)"\n", 1);
                Serial.print(ln);
                Serial.print("\r\n");
                Serial.flush();
              }
            }
            idx = 0;
          }
        } else {
          if (idx < sizeof(ln) - 1) ln[idx++] = (char)c;
        }
      }
      if (idx > 0) {
        ln[idx] = '\0';
        while (idx > 0 && (ln[idx - 1] == ' ' || ln[idx - 1] == '\t')) ln[--idx] = '\0';
        if (idx > 0) {
          size_t coli = 0;
          while (ln[coli] && ln[coli] != ':') coli++;
          if (ln[coli] == ':') {
            crc = crc32_update(crc, (const uint8_t*)ln, idx);
            crc = crc32_update(crc, (const uint8_t*)"\n", 1);
            br_sha256_update(&sha, (const void*)ln, idx);
            br_sha256_update(&sha, (const void*)"\n", 1);
            Serial.print(ln);
            Serial.print("\r\n");
            Serial.flush();
          }
        }
      }
      f.close();
    }
  }
  crc = crc32_final(crc);
  uint8_t h[32];
  br_sha256_out(&sha, h);
  emitBlockEnd(crc, h, endPrefix);
}

void sendFileText(const char* path, const char* errLine, const char* endLine) {
  if (!LittleFS.exists(path)) {
    while (Serial.availableForWrite() < 64) { yield(); delay(1); }
    Serial.print(errLine);
    Serial.print("\r\n");
    Serial.print(endLine);
    Serial.print("\r\n");
    return;
  }
  File f = LittleFS.open(path, "r");
  if (!f) {
    while (Serial.availableForWrite() < 64) { yield(); delay(1); }
    Serial.print(errLine);
    Serial.print("\r\n");
    Serial.print(endLine);
    Serial.print("\r\n");
    return;
  }
  size_t lineCount = 0;
  while (f.available()) {
    while (Serial.availableForWrite() < 64) { yield(); delay(1); }
    String line = f.readStringUntil('\n');
    Serial.print(line);
    Serial.print("\r\n");
    lineCount++;
    Serial.flush();
    yield();
  }
  f.close();
  while (Serial.availableForWrite() < 32) { yield(); delay(1); }
  Serial.flush();
  Serial.print(endLine);
  Serial.print(":");
  Serial.print(lineCount);
  Serial.print("\r\n");
  Serial.flush();
}

void dumpSceneFile(void) {
  if (!LittleFS.exists(SCENE_FILE)) {
    sendLine("SCENE_DUMP_ERR:nofile");
    return;
  }
  File f = LittleFS.open(SCENE_FILE, "r");
  if (!f) {
    sendLine("SCENE_DUMP_ERR:open");
    return;
  }
  size_t offset = 0;
  uint8_t buf[SCENE_DUMP_CHUNK];
  char lineBufHex[4 + 1 + SCENE_DUMP_CHUNK * 2 + 1];
  size_t n;
  while ((n = f.read(buf, sizeof(buf))) > 0) {
    size_t i = 0;
    lineBufHex[i++] = hexTab[(offset >> 12) & 0x0f];
    lineBufHex[i++] = hexTab[(offset >> 8) & 0x0f];
    lineBufHex[i++] = hexTab[(offset >> 4) & 0x0f];
    lineBufHex[i++] = hexTab[offset & 0x0f];
    lineBufHex[i++] = ':';
    for (size_t j = 0; j < n; j++) {
      lineBufHex[i++] = hexTab[buf[j] >> 4];
      lineBufHex[i++] = hexTab[buf[j] & 0x0f];
    }
    lineBufHex[i] = '\0';
    Serial.print("SCENE_DUMP:");
    Serial.println(lineBufHex);
    offset += n;
  }
  f.close();
  Serial.print("SCENE_DUMP_END:");
  Serial.println(offset);
}

void debugRxHex(const char* buf, size_t n) {
#if DEBUG_RX
  Serial.print("RX? ");
  for (size_t i = 0; i < n && i < 8; i++) {
    if (i) Serial.print(" ");
    Serial.print((unsigned)(uint8_t)buf[i], HEX);
  }
  Serial.println();
#endif
}
