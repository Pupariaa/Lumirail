#include <LittleFS.h>
#include <bearssl/bearssl_hash.h>
#include <string.h>

#include "config.h"
#include "crc_hash.h"
#include "storage.h"
#include "serial_protocol.h"
#include "utils.h"

static char lineBuf[LINE_BUF_MAX];
static size_t lineLen;
static uint8_t sceneState;
static uint8_t sceneSlot;
static uint32_t sceneExpectedSize;
static uint32_t sceneReceivedCount;
static File sceneFile;
static uint32_t sceneChunkTotalSize;
static uint32_t sceneChunkSize;
static uint8_t sceneChunkIndex;
static uint32_t sceneChunkBytesRemaining;
static uint32_t sceneChunkCrc;
static uint32_t sceneState1LastByteMs;
static uint32_t sceneFrameCount;
static char sceneLineBuf[SCENE_LINE_BUF_MAX];
static size_t sceneLineLen;

static uint32_t lastPingMs;
static uint32_t lastUploadDoneMs;
static uint8_t playState;
static File playFile;
static uint32_t playDelayMs;
static uint8_t playLoop;
static uint32_t playLastFrameMs;
static char playLineBuf[SCENE_LINE_BUF_MAX];
static size_t playLineLen;

void setup(void) {
  Serial.begin(SERIAL_BAUD);
  if (!LittleFS.begin()) {
    Serial.println("LittleFS begin failed");
    return;
  }
  printStorageState();
  lineLen = 0;
  sceneState = 0;
  sceneSlot = 1;
  lastPingMs = millis();
  lastUploadDoneMs = 0;
  playState = 0;
}

void loop(void) {
  if (sceneState == 1) {
    while (Serial.available() && sceneFile) {
      int c = Serial.read();
      if (c < 0) break;
      sceneState1LastByteMs = millis();
      if (c == '\n' || c == '\r') {
        if (c == '\r') {
          int n = Serial.peek();
          if (n == '\n') Serial.read();
        }
        if (sceneLineLen > 0) {
          sceneLineBuf[sceneLineLen] = '\0';
          if (sceneLineLen == 9 && memcmp(sceneLineBuf, "SCENE_END", 9) == 0) {
            sceneFile.close();
            sceneFile = File();
            sceneState = 0;
            sendLine("SCENE_DONE");
            lastUploadDoneMs = millis();
            break;
          } else {
            sceneFile.write((const uint8_t*)sceneLineBuf, sceneLineLen);
            sceneFile.write((uint8_t)'\n');
            sceneFrameCount++;
            sceneLineLen = 0;
            while (Serial.available() && sceneLineLen < SCENE_LINE_BUF_MAX - 1) {
              int d = Serial.read();
              if (d >= 0) {
                sceneLineBuf[sceneLineLen++] = (char)d;
                sceneState1LastByteMs = millis();
              }
            }
            for (unsigned long t = millis(); Serial.availableForWrite() < 24 && (millis() - t) < SCENE_FRAME_TX_WAIT_MS; ) {
              yield();
              delay(1);
            }
            if (Serial.availableForWrite() >= 24) {
              char fn[7];
              uint32_t n = sceneFrameCount;
              fn[6] = '\0';
              fn[5] = (char)('0' + (n % 10)); n /= 10;
              fn[4] = (char)('0' + (n % 10)); n /= 10;
              fn[3] = (char)('0' + (n % 10)); n /= 10;
              fn[2] = (char)('0' + (n % 10)); n /= 10;
              fn[1] = (char)('0' + (n % 10)); n /= 10;
              fn[0] = (char)('0' + (n % 10));
              Serial.print("FRAME_RECV:");
              Serial.print(fn);
              Serial.print("\r\n");
            }
            delay(SCENE_FRAME_DRAIN_MS);
            while (sceneLineLen > 0 && sceneFile) {
              size_t idx = 0;
              while (idx < sceneLineLen && sceneLineBuf[idx] != '\n') idx++;
              if (idx >= sceneLineLen) break;
              if (idx == 9 && memcmp(sceneLineBuf, "SCENE_END", 9) == 0) {
                sceneFile.close();
                sceneFile = File();
                sceneState = 0;
                sceneLineLen = 0;
                sendLine("SCENE_DONE");
                lastUploadDoneMs = millis();
                break;
              }
              sceneFile.write((const uint8_t*)sceneLineBuf, idx);
              sceneFile.write((uint8_t)'\n');
              sceneFrameCount++;
              if (idx + 1 < sceneLineLen) {
                memmove(sceneLineBuf, sceneLineBuf + idx + 1, sceneLineLen - idx - 1);
              }
              sceneLineLen -= idx + 1;
              while (Serial.available() && sceneLineLen < SCENE_LINE_BUF_MAX - 1) {
                int d = Serial.read();
                if (d >= 0) {
                  sceneLineBuf[sceneLineLen++] = (char)d;
                  sceneState1LastByteMs = millis();
                }
              }
              for (unsigned long t = millis(); Serial.availableForWrite() < 24 && (millis() - t) < SCENE_FRAME_TX_WAIT_MS; ) {
                yield();
                delay(1);
              }
              if (Serial.availableForWrite() >= 24) {
                char fn[7];
                uint32_t n = sceneFrameCount;
                fn[6] = '\0';
                fn[5] = (char)('0' + (n % 10)); n /= 10;
                fn[4] = (char)('0' + (n % 10)); n /= 10;
                fn[3] = (char)('0' + (n % 10)); n /= 10;
                fn[2] = (char)('0' + (n % 10)); n /= 10;
                fn[1] = (char)('0' + (n % 10)); n /= 10;
                fn[0] = (char)('0' + (n % 10));
                Serial.print("FRAME_RECV:");
                Serial.print(fn);
                Serial.print("\r\n");
              }
              delay(SCENE_FRAME_DRAIN_MS);
            }
          }
        }
        if (sceneState != 1) sceneLineLen = 0;
      } else if (sceneLineLen < SCENE_LINE_BUF_MAX - 1) {
        sceneLineBuf[sceneLineLen++] = (char)c;
      }
    }
    if (sceneFile && (millis() - sceneState1LastByteMs) >= SCENE_STATE1_IDLE_MS) {
      sceneFile.close();
      sceneFile = File();
      sceneState = 0;
      sceneLineLen = 0;
    }
  }

  if (sceneState == 2 && sceneChunkBytesRemaining > 0 && Serial.available() && sceneFile) {
    int c = Serial.read();
    if (c >= 0) {
      uint8_t b = (uint8_t)c;
      sceneChunkCrc = crc32_update(sceneChunkCrc, &b, 1);
      sceneFile.write(b);
      sceneChunkBytesRemaining--;
    }
  }

  while (Serial.available() && (sceneState == 0 || (sceneState == 2 && sceneChunkBytesRemaining == 0))) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineLen > 0) {
        lineBuf[lineLen] = '\0';
        if (lineIsSyn(lineBuf, lineLen)) {
          delay(10);
          Serial.flush();
          sendLine("OK");
        } else if (lineIs(lineBuf, lineLen, "PING", 4)) {
          lastPingMs = millis();
          if (playState != 0) {
            playFile.close();
            playState = 0;
          }
          sendLine("PONG");
        } else if (lineIs(lineBuf, lineLen, "GETCONFIG", 9)) {
          delay(10);
          Serial.flush();
          sendFileBlock(CONFIG_FILE, "CONFEND");
          sendFileBlock(BOARD_FILE, "BOARDEND");
          sendFileBlock(SCENE_META_1, "S1MTEND");
          sendFileBlock(SCENE_META_2, "S2MTEND");
        } else if (lineIs(lineBuf, lineLen, "GETBOARD", 8)) {
          delay(10);
          Serial.flush();
          sendFileLinesWithHash(BOARD_FILE, "BOARDEND", "BOARD_LN", 8);
        } else if (lineIs(lineBuf, lineLen, "GETS1MT", 7)) {
          delay(10);
          Serial.flush();
          sendFileLinesWithHash(SCENE_META_1, "S1MTEND", "S1MT_LN", 7);
        } else if (lineIs(lineBuf, lineLen, "GETS2MT", 7)) {
          delay(10);
          Serial.flush();
          sendFileLinesWithHash(SCENE_META_2, "S2MTEND", "S2MT_LN", 7);
        } else if (lineLen == 15 && lineStartsWith(lineBuf, lineLen, "GET_SCENE_BIN:", 14) && (lineBuf[14] == '1' || lineBuf[14] == '2')) {
          uint8_t slotId = (lineBuf[14] == '2') ? 2 : 1;
          delay(10);
          Serial.flush();
          sendFileText(slotId == 1 ? SCENE_FILE : SCENE_FILE_2, slotId == 1 ? "S1FILEERR:nofile" : "S2FILEERR:nofile", slotId == 1 ? "S1FILEEND" : "S2FILEEND");
        } else if (lineIs(lineBuf, lineLen, "GETS1FILE", 9)) {
          delay(10);
          Serial.flush();
          sendFileText(SCENE_FILE, "S1FILEERR:nofile", "S1FILEEND");
        } else if (lineIs(lineBuf, lineLen, "GETS2FILE", 9)) {
          delay(10);
          Serial.flush();
          sendFileText(SCENE_FILE_2, "S2FILEERR:nofile", "S2FILEEND");
        } else if (lineIs(lineBuf, lineLen, "SCENE_END", 9)) {
          sendLine("SCENE_DONE");
          lastUploadDoneMs = millis();
        } else if (lineStartsWith(lineBuf, lineLen, SET_SCENE_META_PFX, SET_SCENE_META_PFX_LEN) && lineLen >= SET_SCENE_META_PFX_LEN + 1 + 2 + 64 + 1 + 1) {
          uint8_t slotId = (lineBuf[SET_SCENE_META_PFX_LEN] == '2') ? 2 : 1;
          if (lineBuf[SET_SCENE_META_PFX_LEN + 1] != ':') { sendLine("SET_SCENE_META_ERR"); lineLen = 0; continue; }
          size_t hashStart = SET_SCENE_META_PFX_LEN + 2;
          size_t i = hashStart;
          for (; i < hashStart + SCENE_HASH_HEX_LEN; i++)
            if (hexCharToNibble(lineBuf[i]) == 0xff) break;
          if (i != hashStart + SCENE_HASH_HEX_LEN || lineBuf[i] != ':') { sendLine("SET_SCENE_META_ERR"); lineLen = 0; continue; }
          size_t sizeStart = i + 1;
          uint32_t sizeVal = 0;
          for (i = sizeStart; i < lineLen && lineBuf[i] >= '0' && lineBuf[i] <= '9'; i++)
            sizeVal = sizeVal * 10 + (lineBuf[i] - '0');
          if (i != lineLen) { sendLine("SET_SCENE_META_ERR"); lineLen = 0; continue; }
          const char* metaPath = (slotId == 1) ? SCENE_META_1 : SCENE_META_2;
          uint32_t delayVal = 500;
          uint8_t loopVal = 1;
          sceneMetaRead(metaPath, &delayVal, &loopVal);
          char hashBuf[65];
          memcpy(hashBuf, lineBuf + hashStart, SCENE_HASH_HEX_LEN);
          hashBuf[SCENE_HASH_HEX_LEN] = '\0';
          if (sceneMetaWrite(metaPath, hashBuf, sizeVal, delayVal, loopVal)) {
            sendLine("SET_SCENE_META_OK");
          } else {
            sendLine("SET_SCENE_META_ERR");
          }
        } else if (lineIs(lineBuf, lineLen, "CONFACK", 7) || lineIs(lineBuf, lineLen, "CONFERR", 7) || lineIs(lineBuf, lineLen, "BOARDACK", 8) || lineIs(lineBuf, lineLen, "BOARDERR", 8)
            || lineIs(lineBuf, lineLen, "S1MTACK", 7) || lineIs(lineBuf, lineLen, "S1MTERR", 7) || lineIs(lineBuf, lineLen, "S2MTACK", 7) || lineIs(lineBuf, lineLen, "S2MTERR", 7)) {
          (void)0;
        } else if (lineStartsWith(lineBuf, lineLen, SCENE_START_PFX, SCENE_START_PFX_LEN) && lineLen >= SCENE_START_PFX_LEN + 3) {
          uint8_t slotId = (lineBuf[SCENE_START_PFX_LEN] == '2') ? 2 : 1;
          size_t i = SCENE_START_PFX_LEN + 2;
          if (i < lineLen && lineBuf[SCENE_START_PFX_LEN + 1] == ':') {
            uint32_t totalSize = 0;
            for (; i < lineLen; i++) {
              if (lineBuf[i] >= '0' && lineBuf[i] <= '9')
                totalSize = totalSize * 10 + (lineBuf[i] - '0');
              else break;
            }
            if (totalSize > 0 && totalSize <= 1024 * 1024 && i >= lineLen) {
              if (sceneFile) sceneFile.close();
              sceneFile = LittleFS.open(slotId == 1 ? SCENE_FILE : SCENE_FILE_2, "w");
              if (sceneFile) {
                sceneSlot = slotId;
                sceneChunkTotalSize = totalSize;
                sceneChunkSize = (totalSize + SCENE_CHUNKS - 1) / SCENE_CHUNKS;
                sceneChunkIndex = 0;
                sceneChunkBytesRemaining = (0 < SCENE_CHUNKS - 1) ? sceneChunkSize : (totalSize - (SCENE_CHUNKS - 1) * sceneChunkSize);
                sceneChunkCrc = 0xffffffffUL;
                sceneState = 2;
                sendLine("SCENE_START_OK");
              } else {
                sendLine("SCENE_START_ERR:open");
              }
            } else {
              sendLine("SCENE_START_ERR:size");
            }
          } else {
            sendLine("SCENE_START_ERR");
          }
        } else if (lineIsSceneReady(lineBuf, lineLen)) {
          sendLine("SCENE_READY");
        } else if (lineLen == 12 && lineStartsWith(lineBuf, lineLen, "SCENE_SLOT:", 11) && (lineBuf[11] == '1' || lineBuf[11] == '2')) {
          sceneSlot = (lineBuf[11] == '1') ? 1 : 2;
          sendLine("SCENE_SLOT_OK");
        } else if (lineLen > SETCONFIG_PFX_LEN && lineStartsWith(lineBuf, lineLen, SETCONFIG_PFX, SETCONFIG_PFX_LEN)) {
          size_t i = SETCONFIG_PFX_LEN;
          while (i < lineLen && lineBuf[i] != ':') i++;
          if (i + 1 < lineLen) {
            uint8_t active, sop, sot;
            configRead(&active, &sop, &sot);
            if (i - SETCONFIG_PFX_LEN == 12 && memcmp(lineBuf + SETCONFIG_PFX_LEN, "scene_active", 12) == 0) {
              active = (lineBuf[i + 1] == '2') ? 2 : 1;
            } else if (i - SETCONFIG_PFX_LEN == 3 && memcmp(lineBuf + SETCONFIG_PFX_LEN, "SOP", 3) == 0) {
              sop = (lineBuf[i + 1] == '1') ? 1 : 0;
            } else if (i - SETCONFIG_PFX_LEN == 3 && memcmp(lineBuf + SETCONFIG_PFX_LEN, "SOT", 3) == 0) {
              sot = (lineBuf[i + 1] == '1') ? 1 : 0;
            } else {
              sendLine("SETCONFIG_ERR:key");
              lineLen = 0;
              continue;
            }
            if (configWrite(active, sop, sot)) {
              sendLine("SETCONFIG_OK");
            } else {
              sendLine("SETCONFIG_ERR");
            }
          } else {
            sendLine("SETCONFIG_ERR");
          }
        } else if (lineIsSceneDump(lineBuf, lineLen)) {
          dumpSceneFile();
        } else if (lineStartsWith(lineBuf, lineLen, "SCENE_SIZE:", SCENE_SIZE_PFX_LEN) && lineLen > SCENE_SIZE_PFX_LEN && lineLen <= SCENE_SIZE_PFX_LEN + 10) {
          sceneExpectedSize = 0;
          for (size_t i = SCENE_SIZE_PFX_LEN; i < lineLen; i++) {
            if (lineBuf[i] >= '0' && lineBuf[i] <= '9')
              sceneExpectedSize = sceneExpectedSize * 10 + (lineBuf[i] - '0');
            else { sceneExpectedSize = 0; break; }
          }
          if (sceneExpectedSize > 0 && sceneExpectedSize <= 1024 * 1024) {
            if (sceneFile) sceneFile.close();
            sceneFile = LittleFS.open(sceneSlot == 1 ? SCENE_FILE : SCENE_FILE_2, "w");
            if (sceneFile) {
              sceneReceivedCount = 0;
              sceneFrameCount = 0;
              sceneLineLen = 0;
              sceneState1LastByteMs = millis();
              sceneState = 1;
              sendLine("SCENE_SIZE_ACK");
              lineLen = 0;
              break;
            } else {
              sendLine("SCENE_ERR:open");
            }
          } else {
            sendLine("SCENE_ERR:size");
          }
        } else if (lineStartsWith(lineBuf, lineLen, "SCENE_HASH:", SCENE_HASH_PFX_LEN) && lineLen == (size_t)(SCENE_HASH_PFX_LEN + SCENE_HASH_HEX_LEN)) {
          uint8_t expectedHash[32];
          if (!hexToBytes(lineBuf + SCENE_HASH_PFX_LEN, SCENE_HASH_HEX_LEN, expectedHash, 32)) {
            sendLine("SCENE_ERR:hash");
          } else if (!LittleFS.exists(sceneSlot == 1 ? SCENE_FILE : SCENE_FILE_2)) {
            sendLine("SCENE_ERR:nofile");
          } else {
            File f = LittleFS.open(sceneSlot == 1 ? SCENE_FILE : SCENE_FILE_2, "r");
            if (!f) {
              sendLine("SCENE_ERR:open");
            } else {
              uint8_t actualHash[32];
              computeFileSha256(f, actualHash);
              f.close();
              if (memcmp(expectedHash, actualHash, 32) == 0) {
                sendLine("SCENE_OK");
              } else {
                sendLine("SCENE_ERR:verify");
              }
            }
          }
        } else if (sceneState == 2 && lineStartsWith(lineBuf, lineLen, SCENE_CHUNK_CRC_PFX, SCENE_CHUNK_CRC_PFX_LEN) && lineLen >= SCENE_CHUNK_CRC_PFX_LEN + 1 + 1 + 8) {
          size_t i = SCENE_CHUNK_CRC_PFX_LEN;
          uint8_t idx = 0;
          while (i < lineLen && lineBuf[i] >= '0' && lineBuf[i] <= '9') {
            idx = idx * 10 + (lineBuf[i] - '0');
            i++;
          }
          if (i < lineLen && lineBuf[i] == ':' && i + 8 <= lineLen && idx == sceneChunkIndex) {
            uint32_t expectedCrc = 0;
            for (int j = 0; j < 8; j++) {
              uint8_t nib = hexCharToNibble(lineBuf[i + 1 + j]);
              if (nib == 0xff) { expectedCrc = 1; break; }
              expectedCrc = (expectedCrc << 4) | nib;
            }
            uint32_t actualCrc = crc32_final(sceneChunkCrc);
            char hex8[9];
            crc32_to_hex8(actualCrc, hex8);
            if (expectedCrc == actualCrc) {
              Serial.print("SCENE_CHUNK_OK:");
              Serial.println(hex8);
              sceneChunkIndex++;
              if (sceneChunkIndex >= SCENE_CHUNKS) {
                sceneFile.close();
                sceneFile = File();
                sceneState = 0;
                sendLine("SCENE_UPLOAD_DONE");
              } else {
                sceneChunkBytesRemaining = (sceneChunkIndex < SCENE_CHUNKS - 1) ? sceneChunkSize : (sceneChunkTotalSize - (SCENE_CHUNKS - 1) * sceneChunkSize);
                sceneChunkCrc = 0xffffffffUL;
              }
            } else {
              Serial.print("SCENE_CHUNK_ERR:");
              Serial.println(hex8);
              uint32_t written = (sceneChunkIndex < SCENE_CHUNKS - 1) ? sceneChunkSize : (sceneChunkTotalSize - (SCENE_CHUNKS - 1) * sceneChunkSize);
              sceneFile.seek(sceneFile.position() - written, SeekSet);
              sceneChunkBytesRemaining = written;
              sceneChunkCrc = 0xffffffffUL;
            }
          }
        } else if (lineLen == (size_t)(GET_SCENE_HASH_PFX_LEN + 1) && lineStartsWith(lineBuf, lineLen, GET_SCENE_HASH_PFX, GET_SCENE_HASH_PFX_LEN) && (lineBuf[GET_SCENE_HASH_PFX_LEN] == '1' || lineBuf[GET_SCENE_HASH_PFX_LEN] == '2')) {
          uint8_t slotId = (lineBuf[GET_SCENE_HASH_PFX_LEN] == '2') ? 2 : 1;
          const char* path = (slotId == 1) ? SCENE_FILE : SCENE_FILE_2;
          if (!LittleFS.exists(path)) {
            Serial.print("SCENE_HASH_ERR:");
            Serial.println(slotId);
          } else {
            File f = LittleFS.open(path, "r");
            if (!f) {
              Serial.print("SCENE_HASH_ERR:");
              Serial.println(slotId);
            } else {
              uint8_t h[32];
              char hex64[65];
              computeFileSha256(f, h);
              f.close();
              sha256_hex(h, hex64);
              Serial.print("SCENE_HASH_R:");
              Serial.print(slotId);
              Serial.print(":");
              Serial.println(hex64);
            }
          }
        } else {
          debugRxHex(lineBuf, lineLen);
        }
        lineLen = 0;
      }
      if (c == '\r') continue;
    } else {
      if (lineLen < LINE_BUF_MAX - 1) {
        lineBuf[lineLen++] = c;
      } else {
        debugRxHex(lineBuf, lineLen);
        lineLen = 0;
      }
    }
  }

  if (sceneState == 0 && (millis() - lastPingMs) >= STANDALONE_PING_TIMEOUT_MS
      && (lastUploadDoneMs == 0 || (millis() - lastUploadDoneMs) >= STANDALONE_GRACE_AFTER_UPLOAD_MS)) {
    if (playState != 0) {
      if ((millis() - playLastFrameMs) >= playDelayMs && playFile) {
        playLineLen = 0;
        while (playFile.available() && playLineLen < SCENE_LINE_BUF_MAX - 1) {
          int c = playFile.read();
          if (c < 0) break;
          if (c == '\r') {
            if (playFile.available() && playFile.peek() == '\n') playFile.read();
            break;
          }
          if (c == '\n') break;
          playLineBuf[playLineLen++] = (char)c;
        }
        playLineBuf[playLineLen] = '\0';
        if (playLineLen == 0 && !playFile.available()) {
          if (playLoop) {
            playFile.seek(0, SeekSet);
          } else {
            playFile.close();
            playState = 0;
          }
          playLastFrameMs = millis();
        } else if (playLineLen == 9 && memcmp(playLineBuf, "SCENE_END", 9) == 0) {
          if (playLoop) {
            playFile.seek(0, SeekSet);
          } else {
            playFile.close();
            playState = 0;
          }
          playLastFrameMs = millis();
        } else if (playLineLen > 0) {
          Serial.println(playLineBuf);
          playLastFrameMs = millis();
        } else {
          playLastFrameMs = millis();
        }
      }
    } else {
      uint8_t active = 1;
      uint8_t sop = 0, sot = 0;
      configRead(&active, &sop, &sot);
      const char* metaPath = (active == 2) ? SCENE_META_2 : SCENE_META_1;
      const char* scenePath = (active == 2) ? SCENE_FILE_2 : SCENE_FILE;
      playDelayMs = 500;
      playLoop = 1;
      sceneMetaRead(metaPath, &playDelayMs, &playLoop);
      if (LittleFS.exists(scenePath)) {
        playFile = LittleFS.open(scenePath, "r");
        if (playFile) {
          playState = 1;
          playLastFrameMs = millis() - playDelayMs;
        }
      }
    }
  } else if (playState != 0 && (millis() - lastPingMs) < STANDALONE_PING_TIMEOUT_MS) {
    playFile.close();
    playState = 0;
  }
}
