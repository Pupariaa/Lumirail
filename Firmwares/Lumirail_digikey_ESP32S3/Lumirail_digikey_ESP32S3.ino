#include "config.h"
#include "bridge.h"
#include "bridge_util.h"
#include "USB.h"
#if USE_SPIFFS
#include <SPIFFS.h>
#else
#include <LittleFS.h>
#endif
#include <string.h>
#include <stdio.h>

#define RECV_PHASE_LINE 0
#define RECV_PHASE_BINARY 1
#define SEND_PHASE_IDLE 0
#define SEND_PHASE_WAIT_START_OK 1
#define SEND_PHASE_SENDING_BLOCKS 2
#define SEND_PHASE_WAIT_FINAL 3

HardwareSerial SerialModule(1);

static uint8_t lineBuf[LINE_BUF_MAX];
static size_t lineLen;
static bool sceneState;
static uint32_t sceneBytesRemaining;
static uint32_t sceneLfpSize;
static uint32_t sceneSendToModuleLfpSize;
static char sceneSendToModuleHash[65];
static File sceneBridgeFile;
static uint8_t sceneRecvPhase;
static char sceneRecvLineBuf[96];
static size_t sceneRecvLineLen;
static uint32_t sceneRecvBlockIdx;
static uint32_t sceneRecvBlockLen;
static uint32_t sceneRecvBlockCrcExpected;
static uint8_t sceneRecvBlockBuf[SCENE_BRIDGE_BLOCK_SIZE];
static uint32_t sceneRecvBlockBufLen;
static bool sceneGetHashPending;
static uint8_t sceneSendPhase;
static bool sceneSendState;
static File sceneSendFile;
static uint32_t sceneSendBlockIndex;
static uint32_t sceneSendBlockCount;
static bool sceneSendBlockWaitingAck;
static uint8_t sceneSendBlockBuf[SCENE_BRIDGE_BLOCK_SIZE];
static uint32_t sceneSendBlockBytesSent;
static uint32_t sceneSendWaitStartMs;
static uint32_t sceneSendWaitBlockOkMs;
static uint32_t sceneSendWaitFinalMs;
static uint8_t moduleToUsbBuf[MODULE_TO_USB_BUF_SIZE];
static uint16_t moduleToUsbHead;
static uint16_t moduleToUsbTail;
static size_t moduleToUsbCount;
static uint32_t sceneBridgeReceiveStartMs;
static char moduleLineBuf[80];
static size_t moduleLineLen;
static uint8_t sceneRecvHashStored[32];
static bool sceneRecvHashValid;
static uint32_t sceneRecvCrc;
static uint32_t sceneRecvCrcStored;
static uint32_t moduleKeepaliveLastMs;

static void usbDrain(void) {
  for (int n = 0; n < 64 && Serial.availableForWrite() > 0 && moduleToUsbCount > 0; n++) {
    Serial.write(moduleToUsbBuf[moduleToUsbHead]);
    moduleToUsbHead++;
    if (moduleToUsbHead >= MODULE_TO_USB_BUF_SIZE) moduleToUsbHead = 0;
    moduleToUsbCount--;
    if ((n & 15) == 15) delay(0);
  }
}

static void usbQueueByte(uint8_t b) {
  if (moduleToUsbCount >= MODULE_TO_USB_BUF_SIZE) return;
  moduleToUsbBuf[moduleToUsbTail] = b;
  moduleToUsbTail++;
  if (moduleToUsbTail >= MODULE_TO_USB_BUF_SIZE) moduleToUsbTail = 0;
  moduleToUsbCount++;
}

static void usbQueueStr(const char* s) {
  for (; *s; s++) usbQueueByte((uint8_t)*s);
}

static void processModuleLine(void) {
  if (moduleLineLen == 0) return;
  moduleLineBuf[moduleLineLen] = '\0';
  for (size_t i = 0; i < moduleLineLen; i++)
    usbQueueByte((uint8_t)moduleLineBuf[i]);
  usbQueueByte('\n');
  if (sceneSendPhase == SEND_PHASE_WAIT_START_OK && moduleLineLen == 14 && memcmp(moduleLineBuf, "SCENE_START_OK", 14) == 0) {
    sceneSendPhase = SEND_PHASE_SENDING_BLOCKS;
    sceneSendBlockIndex = 0;
    sceneSendBlockWaitingAck = false;
    sceneSendBlockBytesSent = 0;
  } else if (sceneSendPhase == SEND_PHASE_SENDING_BLOCKS && moduleLineLen >= 15 && memcmp(moduleLineBuf, "SCENE_BLOCK_OK:", 15) == 0) {
    uint32_t idx = 0;
    for (size_t i = 15; i < moduleLineLen && moduleLineBuf[i] >= '0' && moduleLineBuf[i] <= '9'; i++)
      idx = idx * 10 + (moduleLineBuf[i] - '0');
    if (idx == sceneSendBlockIndex) {
      sceneSendBlockWaitingAck = false;
      sceneSendBlockBytesSent = 0;
      sceneSendBlockIndex++;
      if (sceneSendBlockIndex >= sceneSendBlockCount) {
#if DEBUG_SCENE
        usbQueueStr("BRIDGE:DBG:last_block_ok\n");
#endif
        if (sceneRecvHashValid) {
          bridgeSendSceneHashBinary(sceneRecvHashStored);
#if DEBUG_SCENE
          usbQueueStr("BRIDGE:DBG:hash_queued\n");
#endif
        } else {
          usbQueueStr("SCENE_BRIDGE_ERR:no_hash\n");
        }
        sceneSendPhase = SEND_PHASE_WAIT_FINAL;
        sceneSendWaitFinalMs = millis();
      }
    }
  } else if (sceneSendPhase == SEND_PHASE_WAIT_FINAL && (moduleLineLen == 8 && memcmp(moduleLineBuf, "SCENE_OK", 8) == 0 || (moduleLineLen >= 9 && memcmp(moduleLineBuf, "SCENE_ERR", 9) == 0))) {
    sceneSendPhase = SEND_PHASE_IDLE;
    sceneSendState = false;
    if (sceneSendFile) {
      sceneSendFile.close();
      sceneSendFile = File();
    }
    sceneSendToModuleLfpSize = 0;
  } else if (sceneSendPhase == SEND_PHASE_SENDING_BLOCKS && moduleLineLen >= 16 && memcmp(moduleLineBuf, "SCENE_BLOCK_ERR:", 16) == 0) {
    sceneSendBlockWaitingAck = false;
    sceneSendPhase = SEND_PHASE_IDLE;
    sceneSendState = false;
    if (sceneSendFile) {
      sceneSendFile.close();
      sceneSendFile = File();
    }
    usbQueueStr("SCENE_BRIDGE_ERR:block\n");
  }
  moduleLineLen = 0;
}

static void pollModuleOneByte(void) {
  if (SerialModule.available() == 0) return;
  int c = SerialModule.read();
  if (c < 0) return;
  uint8_t b = (uint8_t)c;
  usbQueueByte(b);
  if (sceneSendState && (sceneSendPhase == SEND_PHASE_WAIT_START_OK || sceneSendPhase == SEND_PHASE_SENDING_BLOCKS || sceneSendPhase == SEND_PHASE_WAIT_FINAL)) {
    if (b == '\n' || b == '\r') {
      if (moduleLineLen > 0) {
        processModuleLine();
      }
    } else {
      if (moduleLineLen < sizeof(moduleLineBuf) - 1)
        moduleLineBuf[moduleLineLen++] = (char)b;
    }
  }
}


void setup() {
  bridge_set_usb_output(usbQueueStr);
  USB.productName(USB_PRODUCT_NAME);
  USB.manufacturerName(USB_MANUFACTURER);
  USB.serialNumber(USB_SERIAL_NUMBER);
  Serial.begin(115200);
  Serial.setRxBufferSize(32768);
  SerialModule.begin(UART_MODULE_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
#if USE_SPIFFS
  if (!SPIFFS.begin(true))
    usbPrint("SPIFFS_FAIL\n");
#else
  if (!LittleFS.begin(true))
    usbPrint("LITTLEFS_FAIL\n");
#endif
  lineLen = 0;
  sceneState = false;
  sceneSendState = false;
  sceneSendToModuleLfpSize = 0;
  sceneGetHashPending = false;
  sceneSendPhase = SEND_PHASE_IDLE;
  sceneRecvHashValid = false;
  moduleToUsbHead = 0;
  moduleToUsbTail = 0;
  moduleToUsbCount = 0;
  moduleLineLen = 0;
  moduleTxReset();
  sceneSendToModuleHash[0] = '\0';
  moduleKeepaliveLastMs = millis();
  usbPrint("LM-DK-ESP32S3 115200\n");
}

void loop() {
  delay(0);
  usbDrain();
  pollModuleOneByte();
  bridgeDrainModuleTx(128);
  if (sceneState && !sceneSendState) {
    const uint32_t now = millis();
    if ((now - moduleKeepaliveLastMs) >= (uint32_t)MODULE_KEEPALIVE_PING_MS) {
      if (moduleTxPending() + 5 <= MODULE_TX_BUF_SIZE) {
        moduleTxAppend((const uint8_t*)"PING\n", 5);
        moduleKeepaliveLastMs = now;
      }
    }
  }

  if (sceneState && sceneRecvPhase == RECV_PHASE_LINE && Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (sceneRecvLineLen > 0) {
        sceneRecvLineBuf[sceneRecvLineLen] = '\0';
        if (sceneRecvLineLen >= (size_t)(SCENE_BLOCK_PFX_LEN + 4) && memcmp(sceneRecvLineBuf, SCENE_BLOCK_PFX, SCENE_BLOCK_PFX_LEN) == 0) {
          size_t i = SCENE_BLOCK_PFX_LEN;
          uint32_t idx = 0;
          while (sceneRecvLineBuf[i] >= '0' && sceneRecvLineBuf[i] <= '9' && i < sceneRecvLineLen)
            idx = idx * 10 + (sceneRecvLineBuf[i++] - '0');
          if (i < sceneRecvLineLen && sceneRecvLineBuf[i] == ':') {
            i++;
            uint32_t len = 0;
            while (sceneRecvLineBuf[i] >= '0' && sceneRecvLineBuf[i] <= '9' && i < sceneRecvLineLen)
              len = len * 10 + (sceneRecvLineBuf[i++] - '0');
            if (i < sceneRecvLineLen && sceneRecvLineBuf[i] == ':' && i + 8 <= sceneRecvLineLen && len > 0 && len <= SCENE_BRIDGE_BLOCK_SIZE) {
              sceneRecvBlockIdx = idx;
              sceneRecvBlockLen = len;
              sceneRecvBlockCrcExpected = bridge_parse_hex32(sceneRecvLineBuf + i + 1, 8);
              sceneRecvPhase = RECV_PHASE_BINARY;
              sceneRecvBlockBufLen = 0;
              sceneBridgeReceiveStartMs = millis();
            }
          }
        }
        sceneRecvLineLen = 0;
      }
    } else {
      if (sceneRecvLineLen < sizeof(sceneRecvLineBuf) - 1)
        sceneRecvLineBuf[sceneRecvLineLen++] = c;
    }
  }

  if (sceneState && sceneRecvPhase == RECV_PHASE_BINARY && sceneRecvBlockBufLen < sceneRecvBlockLen && Serial.available() > 0) {
    sceneRecvBlockBuf[sceneRecvBlockBufLen++] = (uint8_t)Serial.read();
    if (sceneRecvBlockBufLen >= sceneRecvBlockLen) {
      uint32_t crc = 0xffffffffUL;
      crc = bridge_crc32_update(crc, sceneRecvBlockBuf, sceneRecvBlockLen);
      crc = bridge_crc32_final(crc);
      if (crc == sceneRecvBlockCrcExpected && sceneBridgeFile) {
        sceneBridgeFile.write(sceneRecvBlockBuf, sceneRecvBlockLen);
        bridge_sha256_update(sceneRecvBlockBuf, sceneRecvBlockLen);
        sceneRecvCrc = bridge_crc32_update(sceneRecvCrc, sceneRecvBlockBuf, sceneRecvBlockLen);
        sceneBytesRemaining -= sceneRecvBlockLen;
        char buf[24];
        snprintf(buf, sizeof(buf), "SCENE_BLOCK_OK:%lu\n", (unsigned long)sceneRecvBlockIdx);
        usbQueueStr(buf);
      } else {
        char buf[24];
        snprintf(buf, sizeof(buf), "SCENE_BLOCK_ERR:%lu\n", (unsigned long)sceneRecvBlockIdx);
        usbQueueStr(buf);
      }
      sceneRecvPhase = RECV_PHASE_LINE;
      if (sceneBytesRemaining == 0) {
        sceneRecvCrcStored = bridge_crc32_final(sceneRecvCrc);
        if (bridge_sha256_finish(sceneRecvHashStored)) {
          sceneRecvHashValid = true;
        }
        sceneBridgeFile.close();
        sceneBridgeFile = File();
        sceneState = false;
#if DEBUG_SCENE
        usbQueueStr("BRIDGE:DBG:recv_done\n");
#endif
      }
    }
  } else if (sceneState && sceneRecvPhase == RECV_PHASE_BINARY && sceneRecvBlockBufLen < sceneRecvBlockLen) {
    uint32_t now = millis();
    if ((now - sceneBridgeReceiveStartMs) >= (uint32_t)SCENE_BRIDGE_MAX_RECV_MS) {
      bridge_sha256_abort();
      sceneBridgeFile.close();
      sceneBridgeFile = File();
      sceneState = false;
      sceneRecvPhase = RECV_PHASE_LINE;
      const char* path = SCENE_BRIDGE_TMP;
#if USE_SPIFFS
      SPIFFS.remove(path);
#else
      LittleFS.remove(path);
#endif
      usbQueueStr("SCENE_BRIDGE_ERR:timeout\n");
    }
  }

  if (sceneGetHashPending && !sceneState && !sceneSendState) {
    sceneGetHashPending = false;
    if (sceneRecvHashValid) {
      char crcHex[9];
      char hashHex[65];
      bridge_crc32_to_hex8(sceneRecvCrcStored, crcHex);
      bridge_sha256_to_hex64(sceneRecvHashStored, hashHex);
      char line[96];
      snprintf(line, sizeof(line), "SCENE_HASH:%s:%s\n", crcHex, hashHex);
      usbQueueStr(line);
    } else {
      usbQueueStr("SCENE_HASH_ERR\n");
    }
  }

  if (sceneSendToModuleLfpSize != 0 && !sceneSendState && !sceneState) {
    sceneSendToModuleLfpSize = 0;
    const char* path = SCENE_BRIDGE_TMP;
#if USE_SPIFFS
    sceneSendFile = SPIFFS.open(path, "r");
#else
    sceneSendFile = LittleFS.open(path, "r");
#endif
    if (sceneSendFile) {
      sceneSendBlockCount = (sceneLfpSize + SCENE_BRIDGE_BLOCK_SIZE - 1) / SCENE_BRIDGE_BLOCK_SIZE;
      moduleTxReset();
      bridgeSendSceneStart(sceneLfpSize);
      sceneSendPhase = SEND_PHASE_WAIT_START_OK;
      sceneSendState = true;
      sceneSendWaitStartMs = millis();
#if DEBUG_SCENE
      usbQueueStr("BRIDGE:DBG:send_start\n");
#endif
    } else {
      usbQueueStr("SCENE_BRIDGE_ERR:send_open\n");
    }
  }

  if (sceneSendPhase == SEND_PHASE_WAIT_START_OK) {
    uint32_t now = millis();
    if ((now - sceneSendWaitStartMs) >= (uint32_t)SEND_TO_MODULE_START_OK_MS) {
      sceneSendPhase = SEND_PHASE_IDLE;
      sceneSendState = false;
      if (sceneSendFile) {
        sceneSendFile.close();
        sceneSendFile = File();
      }
      usbQueueStr("SCENE_BRIDGE_ERR:start_timeout\n");
    }
  }

  if (sceneSendPhase == SEND_PHASE_WAIT_FINAL) {
    uint32_t now = millis();
    if ((now - sceneSendWaitFinalMs) >= (uint32_t)SEND_TO_MODULE_FINAL_OK_MS) {
      sceneSendPhase = SEND_PHASE_IDLE;
      sceneSendState = false;
      if (sceneSendFile) {
        sceneSendFile.close();
        sceneSendFile = File();
      }
      usbQueueStr("SCENE_BRIDGE_ERR:final_timeout\n");
    }
  }

  if (sceneSendState && sceneSendPhase == SEND_PHASE_SENDING_BLOCKS && !sceneSendBlockWaitingAck && sceneSendBlockIndex < sceneSendBlockCount && sceneSendFile && moduleTxPending() == 0) {
    const uint32_t blockLen = (sceneSendBlockIndex * SCENE_BRIDGE_BLOCK_SIZE + SCENE_BRIDGE_BLOCK_SIZE <= sceneLfpSize)
      ? SCENE_BRIDGE_BLOCK_SIZE
      : (sceneLfpSize - sceneSendBlockIndex * SCENE_BRIDGE_BLOCK_SIZE);
    size_t n = sceneSendFile.read(sceneSendBlockBuf, (size_t)blockLen);
    if (n == (size_t)blockLen) {
      uint32_t crc = 0xffffffffUL;
      crc = bridge_crc32_update(crc, sceneSendBlockBuf, n);
      crc = bridge_crc32_final(crc);
      char crcHex[9];
      bridge_crc32_to_hex8(crc, crcHex);
      if (moduleTxPending() + 28 + blockLen <= MODULE_TX_BUF_SIZE) {
        bridgeSendSceneBlockLine(sceneSendBlockIndex, (uint32_t)blockLen, crcHex);
        moduleTxAppend(sceneSendBlockBuf, (size_t)blockLen);
        sceneSendBlockBytesSent = blockLen;
        sceneSendBlockWaitingAck = true;
        sceneSendWaitBlockOkMs = millis();
      }
    } else {
      sceneSendFile.seek(sceneSendBlockIndex * SCENE_BRIDGE_BLOCK_SIZE, SeekSet);
    }
  }

  if (sceneSendState && sceneSendPhase == SEND_PHASE_SENDING_BLOCKS && sceneSendBlockWaitingAck) {
    uint32_t now = millis();
    if ((now - sceneSendWaitBlockOkMs) >= (uint32_t)SEND_TO_MODULE_BLOCK_OK_MS) {
      sceneSendBlockWaitingAck = false;
      sceneSendPhase = SEND_PHASE_IDLE;
      sceneSendState = false;
      if (sceneSendFile) {
        sceneSendFile.close();
        sceneSendFile = File();
      }
      usbQueueStr("SCENE_BRIDGE_ERR:block_timeout\n");
    }
  }

  if (!sceneState && !sceneSendState && Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineLen > 0) {
        lineBuf[lineLen] = '\0';
        if (lineLen == 14 && memcmp(lineBuf, "SCENE_GET_HASH", 14) == 0) {
          sceneGetHashPending = true;
        } else {
          handleLine((const char*)lineBuf, lineLen, &sceneState, &sceneBytesRemaining,
              &sceneLfpSize, &sceneSendToModuleLfpSize, sceneSendToModuleHash);
        }
        if (sceneState) {
          sceneRecvPhase = RECV_PHASE_LINE;
          sceneRecvLineLen = 0;
          sceneBridgeReceiveStartMs = millis();
          const char* path = SCENE_BRIDGE_TMP;
#if USE_SPIFFS
          SPIFFS.remove(path);
          sceneBridgeFile = SPIFFS.open(path, "w");
#else
          LittleFS.remove(path);
          sceneBridgeFile = LittleFS.open(path, "w");
#endif
          if (sceneBridgeFile) {
            sceneRecvHashValid = false;
            sceneRecvCrc = 0xffffffffUL;
            bridge_sha256_start();
#if DEBUG_SCENE
            usbQueueStr("BRIDGE:DBG:recv_open\n");
#endif
          } else {
            sceneState = false;
            usbQueueStr("SCENE_BRIDGE_ERR:open\n");
          }
        }
        lineLen = 0;
      }
    } else {
      if (lineLen < LINE_BUF_MAX - 1) {
        lineBuf[lineLen++] = (uint8_t)c;
        if (tryQuickAck((const char*)lineBuf, lineLen)) {
          lineLen = 0;
        }
      } else {
        moduleTxAppend((const uint8_t*)lineBuf, lineLen);
        moduleTxAppend((const uint8_t*)"\n", 1);
        lineLen = 0;
        moduleTxAppend((const uint8_t*)&c, 1);
      }
    }
  }
}
