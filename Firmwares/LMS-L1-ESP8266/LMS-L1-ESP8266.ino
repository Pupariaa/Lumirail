#include <LittleFS.h>
#include <bearssl/bearssl_hash.h>
#include <string.h>

#include "config.h"
#include "crc_hash.h"
#include "storage.h"
#include "serial_protocol.h"
#include "utils.h"
#include "lfp_reader.h"

static char lineBuf[LINE_BUF_MAX];
static size_t lineLen;
static uint8_t sceneState;
static File sceneFile;
static uint32_t sceneTotalSize;
static uint32_t sceneBytesRemaining;
static uint8_t sceneRecvPhase;
static char sceneRecvLineBuf[64];
static size_t sceneRecvLineLen;
static uint32_t sceneRecvBlockIdx;
static uint32_t sceneRecvBlockLen;
static uint32_t sceneRecvBlockCrcExpected;
static uint8_t sceneRecvBlockBuf[SCENE_BLOCK_SIZE];
static uint32_t sceneRecvBlockBufLen;
static bool sceneHashParseFailed;
static uint8_t sceneHashBinPhase;
static uint8_t sceneHashBinBytesRead;
static uint8_t sceneHashExpected[32];

static uint32_t lastPingMs;
static uint32_t lastUploadDoneMs;
static uint8_t playState;
static File playFile;
static uint32_t playDelayMs;
static uint8_t playLoop;
static uint32_t playLastFrameMs;
static char playLineBuf[SCENE_LINE_BUF_MAX];
static size_t playLineLen;
static uint8_t playLfp;
static lfp_playback_t lfpInfo;
static uint32_t playFrameIndex;
static uint8_t playFrameBuf[LFP_MAX_CHANNELS];

#define SERIAL_RX_BUFFER_SIZE 512

void setup(void) {
  Serial.begin(SERIAL_BAUD);
  Serial.setRxBufferSize(SERIAL_RX_BUFFER_SIZE);
  if (!LittleFS.begin()) {
    Serial.println("LittleFS begin failed");
    return;
  }
  printStorageState();
  lineLen = 0;
  sceneState = 0;
  lastPingMs = millis();
  lastUploadDoneMs = 0;
  playState = 0;
}

void loop(void) {
  if (sceneHashBinPhase == 1) {
    while (Serial.available() > 0 && sceneHashBinBytesRead < 32) {
      sceneHashExpected[sceneHashBinBytesRead++] = (uint8_t)Serial.read();
      lastPingMs = millis();
    }
    if (sceneHashBinBytesRead == 32) {
#if DEBUG_SCENE
      Serial.println("MOD:DBG:hash_received");
#endif
      sceneHashBinPhase = 0;
      sceneHashBinBytesRead = 0;
      if (sceneFile) {
        sceneFile.close();
        sceneFile = File();
      }
      if (!LittleFS.exists(SCENE_TMP)) {
        sendLine("SCENE_ERR:nofile");
      } else {
        File f = LittleFS.open(SCENE_TMP, "r");
        if (!f) {
          sendLine("SCENE_ERR:open");
        } else {
#if DEBUG_SCENE
          Serial.println("MOD:DBG:computing_hash");
#endif
          uint8_t actualHash[32];
          computeFileSha256(f, actualHash);
          f.close();
#if DEBUG_SCENE
          Serial.println("MOD:DBG:hash_computed");
#endif
          if (memcmp(sceneHashExpected, actualHash, 32) == 0) {
            if (sceneCommit()) {
              sendLine("SCENE_OK");
            } else {
              sendLine("SCENE_ERR:commit");
            }
          } else {
            sendLine("SCENE_ERR:verify");
          }
        }
      }
    }
  }

  if (sceneState == 2 && sceneRecvPhase == 1 && sceneRecvBlockBufLen < sceneRecvBlockLen && Serial.available() >= (int)sceneRecvBlockLen) {
    for (uint32_t i = 0; i < sceneRecvBlockLen; i++) {
      sceneRecvBlockBuf[sceneRecvBlockBufLen++] = (uint8_t)Serial.read();
      lastPingMs = millis();
    }
    uint32_t crc = 0xffffffffUL;
    crc = crc32_update(crc, sceneRecvBlockBuf, sceneRecvBlockLen);
    crc = crc32_final(crc);
    if (crc == sceneRecvBlockCrcExpected && sceneFile) {
      sceneFile.write(sceneRecvBlockBuf, sceneRecvBlockLen);
      sceneBytesRemaining -= sceneRecvBlockLen;
      Serial.print("SCENE_BLOCK_OK:");
      Serial.println(sceneRecvBlockIdx);
      if (sceneBytesRemaining == 0) {
        sceneFile.close();
        sceneFile = File();
        sceneState = 0;
        lastUploadDoneMs = millis();
        sendLine("SCENE_UPLOAD_DONE");
      }
    } else {
      Serial.print("SCENE_BLOCK_ERR:");
      Serial.println(sceneRecvBlockIdx);
    }
    sceneRecvPhase = 0;
  }

  bool stopLineRead = false;
  while (Serial.available() && sceneHashBinPhase == 0 && (sceneState == 0 || (sceneState == 2 && sceneRecvPhase == 0))) {
    char c = (char)Serial.read();
    lastPingMs = millis();
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
          sendSceneMetaBlock("S1MTEND");
          sendSceneMetaBlock("S2MTEND");
        } else if (lineIs(lineBuf, lineLen, "GETBOARD", 8)) {
          delay(10);
          Serial.flush();
          sendFileLinesWithHash(BOARD_FILE, "BOARDEND", "BOARD_LN", 8);
        } else if (lineIs(lineBuf, lineLen, "GETS1MT", 7)) {
          delay(10);
          Serial.flush();
          sendSceneMetaBlock("S1MTEND");
        } else if (lineIs(lineBuf, lineLen, "GETS2MT", 7)) {
          delay(10);
          Serial.flush();
          sendSceneMetaBlock("S2MTEND");
        } else if (lineStartsWith(lineBuf, lineLen, "GET_SCENE_BIN:", 14)) {
          delay(10);
          Serial.flush();
          sendFileText(SCENE_BIN, "S1FILEERR:nofile", "S1FILEEND");
        } else if (lineIs(lineBuf, lineLen, "GETS1FILE", 9)) {
          delay(10);
          Serial.flush();
          sendFileText(SCENE_BIN, "S1FILEERR:nofile", "S1FILEEND");
        } else if (lineIs(lineBuf, lineLen, "GETS2FILE", 9)) {
          delay(10);
          Serial.flush();
          sendFileText(SCENE_BIN, "S2FILEERR:nofile", "S2FILEEND");
        } else if (lineStartsWith(lineBuf, lineLen, SET_SCENE_META_PFX, SET_SCENE_META_PFX_LEN) && lineLen >= SET_SCENE_META_PFX_LEN + 2 + 64 + 1 + 1) {
          size_t hashStart = SET_SCENE_META_PFX_LEN;
          if (lineBuf[hashStart] == '1' || lineBuf[hashStart] == '2') hashStart += 2;
          else if (lineBuf[hashStart] == ':') hashStart += 1;
          size_t i = hashStart;
          if (i + SCENE_HASH_HEX_LEN + 1 >= lineLen) { sendLine("SET_SCENE_META_ERR"); lineLen = 0; continue; }
          for (; i < hashStart + SCENE_HASH_HEX_LEN; i++)
            if (hexCharToNibble(lineBuf[i]) == 0xff) break;
          if (i != hashStart + SCENE_HASH_HEX_LEN || lineBuf[i] != ':') { sendLine("SET_SCENE_META_ERR"); lineLen = 0; continue; }
          size_t sizeStart = i + 1;
          uint32_t sizeVal = 0;
          for (i = sizeStart; i < lineLen && lineBuf[i] >= '0' && lineBuf[i] <= '9'; i++)
            sizeVal = sizeVal * 10 + (lineBuf[i] - '0');
          if (i != lineLen) { sendLine("SET_SCENE_META_ERR"); lineLen = 0; continue; }
          uint8_t active = 1, sop = 0, sot = 0, playLoop = 1;
          configRead(&active, &sop, &sot, &playLoop);
          if (configWrite(active, sop, sot, playLoop)) {
            sendLine("SET_SCENE_META_OK");
          } else {
            sendLine("SET_SCENE_META_ERR");
          }
        } else if (lineIs(lineBuf, lineLen, "CONFACK", 7) || lineIs(lineBuf, lineLen, "CONFERR", 7) || lineIs(lineBuf, lineLen, "BOARDACK", 8) || lineIs(lineBuf, lineLen, "BOARDERR", 8)
            || lineIs(lineBuf, lineLen, "S1MTACK", 7) || lineIs(lineBuf, lineLen, "S1MTERR", 7) || lineIs(lineBuf, lineLen, "S2MTACK", 7) || lineIs(lineBuf, lineLen, "S2MTERR", 7)) {
          (void)0;
        } else if (lineStartsWith(lineBuf, lineLen, SCENE_UPLOAD_START_PFX, SCENE_UPLOAD_START_PFX_LEN) && lineLen > SCENE_UPLOAD_START_PFX_LEN + 1 && lineBuf[SCENE_UPLOAD_START_PFX_LEN] == ':') {
          if (LittleFS.exists(SCENE_TMP)) LittleFS.remove(SCENE_TMP);
          sendLine("SCENE_UPLOAD_READY");
        } else if (lineStartsWith(lineBuf, lineLen, SCENE_START_PFX, SCENE_START_PFX_LEN) && lineLen > SCENE_START_PFX_LEN) {
          size_t i = SCENE_START_PFX_LEN;
          uint32_t totalSize = 0;
          for (; i < lineLen && lineBuf[i] >= '0' && lineBuf[i] <= '9'; i++)
            totalSize = totalSize * 10 + (lineBuf[i] - '0');
          if (i == lineLen && totalSize > 0 && totalSize <= 1024 * 1024) {
            if (sceneFile) sceneFile.close();
            if (LittleFS.exists(SCENE_TMP)) LittleFS.remove(SCENE_TMP);
            sceneFile = LittleFS.open(SCENE_TMP, "w");
            if (sceneFile) {
                sceneTotalSize = totalSize;
                sceneBytesRemaining = totalSize;
                sceneRecvPhase = 0;
                sceneRecvLineLen = 0;
                sceneHashParseFailed = false;
                sceneState = 2;
#if DEBUG_SCENE
                Serial.printf("MOD:DBG:scene_start size=%u\n", (unsigned)totalSize);
#endif
                sendLine("SCENE_START_OK");
              } else {
                sendLine("SCENE_START_ERR:open");
              }
          } else {
            sendLine("SCENE_START_ERR:size");
          }
        } else if (lineIsSceneReady(lineBuf, lineLen)) {
          sendLine("SCENE_READY");
        } else if (lineLen > SETCONFIG_PFX_LEN && lineStartsWith(lineBuf, lineLen, SETCONFIG_PFX, SETCONFIG_PFX_LEN)) {
          size_t i = SETCONFIG_PFX_LEN;
          while (i < lineLen && lineBuf[i] != ':') i++;
          if (i + 1 < lineLen) {
            uint8_t active, sop, sot, playLoop;
            configRead(&active, &sop, &sot, &playLoop);
            if (i - SETCONFIG_PFX_LEN == 3 && memcmp(lineBuf + SETCONFIG_PFX_LEN, "SOP", 3) == 0) {
              sop = (lineBuf[i + 1] == '1') ? 1 : 0;
            } else if (i - SETCONFIG_PFX_LEN == 3 && memcmp(lineBuf + SETCONFIG_PFX_LEN, "SOT", 3) == 0) {
              sot = (lineBuf[i + 1] == '1') ? 1 : 0;
            } else if (i - SETCONFIG_PFX_LEN == 9 && memcmp(lineBuf + SETCONFIG_PFX_LEN, "play_loop", 9) == 0) {
              playLoop = (lineBuf[i + 1] == 't' || lineBuf[i + 1] == 'T' || lineBuf[i + 1] == '1') ? 1 : 0;
            } else {
              sendLine("SETCONFIG_ERR:key");
              lineLen = 0;
              continue;
            }
            if (configWrite(active, sop, sot, playLoop)) {
              sendLine("SETCONFIG_OK");
            } else {
              sendLine("SETCONFIG_ERR");
            }
          } else {
            sendLine("SETCONFIG_ERR");
          }
        } else if (lineIsSceneDump(lineBuf, lineLen)) {
          dumpSceneFile(SCENE_BIN);
        } else if (lineIs(lineBuf, lineLen, "SCENE_HASH_BIN", 14)) {
          sceneHashBinPhase = 1;
          sceneHashBinBytesRead = 0;
          stopLineRead = true;
        } else if (lineStartsWith(lineBuf, lineLen, "SCENE_HASH:", SCENE_HASH_PFX_LEN) && lineLen >= (size_t)(SCENE_HASH_PFX_LEN + SCENE_HASH_HEX_LEN)) {
          uint8_t expectedHash[32];
          if (hexToBytes(lineBuf + SCENE_HASH_PFX_LEN, SCENE_HASH_HEX_LEN, expectedHash, 32)) {
            sceneHashParseFailed = false;
            if (sceneFile) {
              sceneFile.close();
              sceneFile = File();
            }
            if (!LittleFS.exists(SCENE_TMP)) {
              sendLine("SCENE_ERR:nofile");
            } else {
              File f = LittleFS.open(SCENE_TMP, "r");
              if (!f) {
                sendLine("SCENE_ERR:open");
              } else {
                uint8_t actualHash[32];
                computeFileSha256(f, actualHash);
                f.close();
                if (memcmp(expectedHash, actualHash, 32) == 0) {
                  if (sceneCommit()) {
                    sendLine("SCENE_OK");
                  } else {
                    sendLine("SCENE_ERR:commit");
                  }
                } else {
                  sendLine("SCENE_ERR:verify");
                }
              }
            }
          } else {
            if (sceneHashParseFailed) {
              sendLine("SCENE_ERR:hash");
            } else {
              sceneHashParseFailed = true;
            }
          }
        } else if (sceneState == 2 && lineStartsWith(lineBuf, lineLen, SCENE_BLOCK_PFX, SCENE_BLOCK_PFX_LEN) && lineLen >= SCENE_BLOCK_PFX_LEN + 4) {
          size_t i = SCENE_BLOCK_PFX_LEN;
          uint32_t idx = 0;
          while (i < lineLen && lineBuf[i] >= '0' && lineBuf[i] <= '9')
            idx = idx * 10 + (lineBuf[i++] - '0');
          if (i < lineLen && lineBuf[i] == ':') {
            i++;
            uint32_t len = 0;
            while (i < lineLen && lineBuf[i] >= '0' && lineBuf[i] <= '9')
              len = len * 10 + (lineBuf[i++] - '0');
            if (i < lineLen && lineBuf[i] == ':' && i + 8 <= lineLen && len > 0 && len <= SCENE_BLOCK_SIZE) {
              sceneRecvBlockIdx = idx;
              sceneRecvBlockLen = len;
              sceneRecvBlockCrcExpected = parseHex32(lineBuf + i + 1, 8);
              sceneRecvPhase = 1;
              sceneRecvBlockBufLen = 0;
            }
          }
        } else if (lineStartsWith(lineBuf, lineLen, GET_SCENE_HASH_PFX, GET_SCENE_HASH_PFX_LEN)) {
          if (!LittleFS.exists(SCENE_BIN)) {
            Serial.println("SCENE_HASH_ERR");
          } else {
            File f = LittleFS.open(SCENE_BIN, "r");
            if (!f) {
              Serial.println("SCENE_HASH_ERR");
            } else {
              uint8_t h[32];
              char hex64[65];
              computeFileSha256(f, h);
              f.close();
              sha256_hex(h, hex64);
              Serial.print("SCENE_HASH_R:");
              Serial.println(hex64);
            }
          }
        } else {
          debugRxHex(lineBuf, lineLen);
        }
        lineLen = 0;
        if (stopLineRead) break;
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
        if (playLfp) {
          if (playFrameIndex >= lfpInfo.frame_count) {
            if (playLoop) {
              playFrameIndex = 0;
            } else {
              playFile.close();
              playState = 0;
            }
            playLastFrameMs = millis();
          } else {
            if (lfpReadFrame(playFile, &lfpInfo, playFrameIndex, playFrameBuf, sizeof(playFrameBuf))) {
              Serial.print(playFrameIndex / 100000U % 10);
              Serial.print(playFrameIndex / 10000U % 10);
              Serial.print(playFrameIndex / 1000U % 10);
              Serial.print(playFrameIndex / 100U % 10);
              Serial.print(playFrameIndex / 10U % 10);
              Serial.print(playFrameIndex % 10);
              Serial.print("|");
              for (uint16_t i = 0; i < lfpInfo.channel_count; i++) {
                if (i) Serial.print(",");
                Serial.print(playFrameBuf[i]);
              }
              Serial.println();
              playFrameIndex++;
            }
            playLastFrameMs = millis();
          }
        } else {
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
      }
    } else {
      uint8_t active = 1, sop = 0, sot = 0;
      configRead(&active, &sop, &sot, &playLoop);
      const char* scenePath = SCENE_BIN;
      playDelayMs = 500;
      if (LittleFS.exists(scenePath)) {
        playFile = LittleFS.open(scenePath, "r");
        if (playFile) {
          uint8_t magicBuf[4];
          if (playFile.read(magicBuf, 4) == 4) {
            uint32_t magic = (uint32_t)magicBuf[0] | ((uint32_t)magicBuf[1] << 8) | ((uint32_t)magicBuf[2] << 16) | ((uint32_t)magicBuf[3] << 24);
            if (magic == LFP_MAGIC) {
              playFile.seek(0, SeekSet);
              if (lfpVerifyAndParse(playFile, &lfpInfo)) {
                playLfp = 1;
                playDelayMs = lfpInfo.tick_ms;
                playFrameIndex = 0;
                playState = 1;
                playLastFrameMs = millis() - playDelayMs;
              } else {
                playFile.close();
                playState = 0;
              }
            } else {
              playLfp = 0;
              playFile.seek(0, SeekSet);
              playState = 1;
              playLastFrameMs = millis() - playDelayMs;
            }
          } else {
            playLfp = 0;
            playFile.seek(0, SeekSet);
            playState = 1;
            playLastFrameMs = millis() - playDelayMs;
          }
        }
      }
    }
  } else if (playState != 0 && (millis() - lastPingMs) < STANDALONE_PING_TIMEOUT_MS) {
    playFile.close();
    playState = 0;
  }
}
