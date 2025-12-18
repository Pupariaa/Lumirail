#include "espnow_handler.h"
#include <WiFi.h>
#include <esp_wifi.h>
#include <string.h>
#include <cstdlib>
#include "crc32.h"

EspNowHandler espnowHandler;
EspNowHandler* EspNowHandler::instance = nullptr;

EspNowHandler::EspNowHandler() 
  : currentState(STATE_UNPAIRED), 
    lastSequence(0), 
    lastMasterContact(0), 
    lastStatusSent(0),
    lastPairRequest(0),
    retryCount(0),
    commandReceived(false),
    eepromConfig(nullptr),
    fwSessionId(0),
    fwExpectedOffset(0),
    fwTotalSize(0),
    fwCrcExpected(0),
    fwCrcAccum(0),
    fwActive(false),
    lastResendAckTime(0),
    fwBuffer(nullptr),
    fwBufferWritePos(0),
    fwBufferFlashPos(0),
    fwFlashWriteOffset(0),
    fwBufferActive(false),
    lastAckOffset(0),
    lastAckTime(0) {
  instance = this;
}

void EspNowHandler::init() {
  init(nullptr);
}

void EspNowHandler::init(EepromConfig* config) {
  eepromConfig = config;
  
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
  
  if (esp_now_init() != ESP_OK) {
    Serial.print("ERROR: Failed to initialize ESP-NOW\n");
    return;
  }
  
  esp_now_register_recv_cb(onDataReceive);
  esp_now_register_send_cb(onDataSent);
  
  lastStatusSent = millis();
  lastPairRequest = 0;
  if (eepromConfig) {
    uint8_t authMAC[6];
    if (eepromConfig->getAuthorizedMAC(authMAC)) {
      Serial.print("Found authorized Master MAC - will attempt auto-pairing\n");
      delay(500); // Give system time to stabilize
      requestPairing();
    }
  }
}

void EspNowHandler::update() {
  if (fwBufferActive) {
    processFwBuffer();
  }
  
  uint64_t now = millis();
  
  if (currentState == STATE_UNPAIRED) {
    if (eepromConfig) {
      uint8_t authMAC[6];
      if (eepromConfig->getAuthorizedMAC(authMAC)) {
        if (lastMasterContact == 0 || (now - lastMasterContact > 5000)) {
          if (now - lastPairRequest >= 3000) {
            requestPairing();
            lastPairRequest = now;
          }
        }
      } else {
        if (now - lastMasterContact > STATUS_INTERVAL && lastMasterContact == 0) {
          Serial.print("Waiting for Master pairing request...\n");
          lastMasterContact = 1;
        }
      }
    } else {
      if (now - lastMasterContact > STATUS_INTERVAL && lastMasterContact == 0) {
        Serial.print("Waiting for Master pairing request...\n");
        lastMasterContact = 1;
      }
    }
  }
  
  if ((currentState == STATE_DISCOVERED || currentState == STATE_LINKED) && now - lastStatusSent > STATUS_INTERVAL) {
    sendStatus();
    lastStatusSent = now;
  }
  
  checkTimeout();
}

void EspNowHandler::sendStatus() {
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_STATUS_RESPONSE;
  msg.sequence = lastSequence;
  
  int16_t rssi = WiFi.RSSI();
  msg.payload[0] = rssi & 0xFF;
  msg.payload[1] = (rssi >> 8) & 0xFF;
  msg.payloadLength = 2;
  msg.checksum = calculateChecksum(msg);
  
  uint8_t broadcastAddr[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  
  esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, broadcastAddr, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;
  
  esp_err_t addResult = esp_now_add_peer(&peerInfo);
  if (addResult != ESP_OK && addResult != ESP_ERR_ESPNOW_EXIST) {
    Serial.print("ERROR: Failed to add peer: ");
    Serial.print(esp_err_to_name(addResult));
    Serial.print("\n");
    return;
  }
  
  esp_err_t sendResult = esp_now_send(broadcastAddr, (uint8_t *)&msg, sizeof(EspNowMessage));
  if (sendResult != ESP_OK) {
    Serial.print("ERROR: Failed to send status: ");
    Serial.print(esp_err_to_name(sendResult));
    Serial.print("\n");
    retryCount++;
  }
}

void EspNowHandler::requestPairing() {
  if (!eepromConfig) {
    return;
  }
  
  uint8_t authMAC[6];
  if (!eepromConfig->getAuthorizedMAC(authMAC)) {
    return; // No authorized master
  }
  
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_STATUS_RESPONSE;
  msg.sequence = lastSequence++;
  
  int16_t rssi = WiFi.RSSI();
  msg.payload[0] = rssi & 0xFF;
  msg.payload[1] = (rssi >> 8) & 0xFF;
  msg.payloadLength = 2;
  msg.checksum = calculateChecksum(msg);
  
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, authMAC, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;
  
  esp_err_t addResult = esp_now_add_peer(&peerInfo);
  if (addResult != ESP_OK && addResult != ESP_ERR_ESPNOW_EXIST) {
    Serial.print("ERROR: Failed to add authorized master peer: ");
    Serial.print(esp_err_to_name(addResult));
    Serial.print("\n");
    return;
  }
  
  esp_err_t sendResult = esp_now_send(authMAC, (uint8_t *)&msg, sizeof(EspNowMessage));
  if (sendResult == ESP_OK || sendResult == ESP_ERR_ESPNOW_IF) {
    Serial.print("Auto-pairing request sent to authorized master ");
    for (int i = 0; i < 6; i++) {
      Serial.printf("%02X", authMAC[i]);
      if (i < 5) Serial.print(":");
    }
    Serial.print("\n");
  } else {
    Serial.print("ERROR: Failed to send auto-pairing request: ");
    Serial.print(esp_err_to_name(sendResult));
    Serial.print("\n");
  }
  
  esp_now_del_peer(authMAC);
}

void EspNowHandler::sendPairResponse(const uint8_t* mac, bool accepted) {
  EspNowMessage response;
  response.version = 1;
  response.type = MSG_PAIR_RESPONSE;
  response.sequence = lastSequence;
  response.payload[0] = accepted ? 1 : 0;
  uint8_t payloadLen = 1;
  if (eepromConfig && accepted) {
    char serial[9];
    if (eepromConfig->getSerialNumber(serial, 9)) {
      uint8_t serialLen = strlen(serial);
      if (serialLen > 0 && payloadLen + serialLen < 200) {
        memcpy(&response.payload[payloadLen], serial, serialLen);
        payloadLen += serialLen;
        response.payload[payloadLen] = '\0';
        payloadLen++;
      }
    }
  }
  
  response.payloadLength = payloadLen;
  response.checksum = calculateChecksum(response);
  
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  
  esp_now_send(mac, (uint8_t *)&response, sizeof(EspNowMessage));
  esp_now_del_peer(mac);
}

void EspNowHandler::handleFwBegin(const uint8_t* mac, EspNowMessage* msg) {
  Serial.print("FW_BEGIN received - firmware update not supported\n");
  sendNack(mac, msg->sequence);
  return;
}

void EspNowHandler::handleFwChunk(const uint8_t* mac, EspNowMessage* msg) {
  Serial.print("FW_CHUNK received - firmware update not supported\n");
  sendNack(mac, msg->sequence);
  return;
  
  if (!fwActive) { sendNack(mac, msg->sequence); return; }
  if (msg->payloadLength < 2 + 4 + 2 + 4) { sendNack(mac, msg->sequence); return; }
  uint8_t *p = msg->payload;
  uint16_t sid = (uint16_t)p[0] | ((uint16_t)p[1] << 8);
  if (sid != fwSessionId) { sendNack(mac, msg->sequence); return; }
  uint32_t offset = (uint32_t)p[2] | ((uint32_t)p[3] << 8) | ((uint32_t)p[4] << 16) | ((uint32_t)p[5] << 24);
  uint16_t dataLen = (uint16_t)p[6] | ((uint16_t)p[7] << 8);
  if (8 + dataLen + 4 != msg->payloadLength) { sendNack(mac, msg->sequence); return; }
  const uint8_t *data = p + 8;
  uint32_t chunkCrc = (uint32_t)p[8 + dataLen] | ((uint32_t)p[9 + dataLen] << 8) | ((uint32_t)p[10 + dataLen] << 16) | ((uint32_t)p[11 + dataLen] << 24);

  Serial.printf("FW_CHUNK: offset=%u dataLen=%u expectedOffset=%u\n", offset, dataLen, fwExpectedOffset);

  if (offset != fwExpectedOffset) {
    uint64_t now = millis();
    if (now - lastResendAckTime < 200) {
      return;
    }
    lastResendAckTime = now;
    
    EspNowMessage ack;
    ack.version = 1;
    ack.type = MSG_FW_ACK;
    ack.sequence = msg->sequence;
    ack.payloadLength = 6;
    ack.payload[0] = fwSessionId & 0xFF;
    ack.payload[1] = (fwSessionId >> 8) & 0xFF;
    ack.payload[2] = fwExpectedOffset & 0xFF;
    ack.payload[3] = (fwExpectedOffset >> 8) & 0xFF;
    ack.payload[4] = (fwExpectedOffset >> 16) & 0xFF;
    ack.payload[5] = (fwExpectedOffset >> 24) & 0xFF;
    ack.checksum = calculateChecksum(ack);
    esp_now_peer_info_t peerInfo;
    memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, mac, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_STA;
    peerInfo.encrypt = false;
    esp_err_t addRes = esp_now_add_peer(&peerInfo);
    if (addRes != ESP_OK && addRes != ESP_ERR_ESPNOW_EXIST) {
      Serial.print("FW_CHUNK add_peer failed: ");
      Serial.print(esp_err_to_name(addRes));
      Serial.print("\n");
    }
    esp_err_t sendRes = esp_now_send(mac, (uint8_t *)&ack, sizeof(EspNowMessage));
    if (sendRes != ESP_OK && sendRes != ESP_ERR_ESPNOW_IF) {
      Serial.print("FW_CHUNK resend ack failed: ");
      Serial.print(esp_err_to_name(sendRes));
      Serial.print("\n");
    } else {
      Serial.print("FW_ACK resend next=");
      Serial.print(fwExpectedOffset);
      Serial.print("\n");
    }
    esp_now_del_peer(mac);
    return;
  }

  uint32_t ccrc = crc32_finalize(crc32_update(crc32_init(), data, dataLen));
  if (ccrc != chunkCrc) { sendNack(mac, msg->sequence); return; }

  if (!fwBuffer) {
    sendNack(mac, msg->sequence);
    return;
  }

  uint32_t spaceAvailable = FW_BUFFER_SIZE - fwBufferWritePos;
  if (dataLen > spaceAvailable) {
    processFwBuffer();
    spaceAvailable = FW_BUFFER_SIZE - fwBufferWritePos;
    if (dataLen > spaceAvailable) {
      sendNack(mac, msg->sequence);
      return;
    }
  }
  
  memcpy(fwBuffer + fwBufferWritePos, data, dataLen);
  fwBufferWritePos += dataLen;
  fwCrcAccum = crc32_update(fwCrcAccum, data, dataLen);
  fwExpectedOffset += dataLen;

  uint64_t now = millis();
  
  bool shouldAck = false;
  uint32_t bytesSinceLastAck = fwExpectedOffset - lastAckOffset;
  
  if (lastAckOffset == 0) {
    shouldAck = true;
  } else if (bytesSinceLastAck >= 352) {
    shouldAck = true;
  } else if (now - lastAckTime >= 200 && bytesSinceLastAck > 0) {
    shouldAck = true;
  }
  
  if (!shouldAck) {
    Serial.printf("FW_CHUNK offset=%u dataLen=%u fwExpectedOffset=%u lastAckOffset=%u bytesSinceLast=%u shouldAck=false\n", 
                  msg->payload[2] | (msg->payload[3] << 8) | (msg->payload[4] << 16) | (msg->payload[5] << 24),
                  dataLen, fwExpectedOffset, lastAckOffset, bytesSinceLastAck);
  }
  
  if (shouldAck) {
    EspNowMessage ack;
    ack.version = 1;
    ack.type = MSG_FW_ACK;
    ack.sequence = msg->sequence;
    ack.payloadLength = 6;
    ack.payload[0] = fwSessionId & 0xFF;
    ack.payload[1] = (fwSessionId >> 8) & 0xFF;
    ack.payload[2] = fwExpectedOffset & 0xFF;
    ack.payload[3] = (fwExpectedOffset >> 8) & 0xFF;
    ack.payload[4] = (fwExpectedOffset >> 16) & 0xFF;
    ack.payload[5] = (fwExpectedOffset >> 24) & 0xFF;
    ack.checksum = calculateChecksum(ack);
    esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, mac, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_STA;
    peerInfo.encrypt = false;
    esp_err_t addRes2 = esp_now_add_peer(&peerInfo);
    if (addRes2 != ESP_OK && addRes2 != ESP_ERR_ESPNOW_EXIST) {
      Serial.print("FW_CHUNK add_peer failed: ");
      Serial.print(esp_err_to_name(addRes2));
      Serial.print("\n");
    }
    esp_err_t sendRes2 = esp_now_send(mac, (uint8_t *)&ack, sizeof(EspNowMessage));
    if (sendRes2 != ESP_OK && sendRes2 != ESP_ERR_ESPNOW_IF) {
      Serial.print("FW_CHUNK ack send failed: ");
      Serial.print(esp_err_to_name(sendRes2));
      Serial.print("\n");
    } else {
      uint32_t ramUsed = fwBufferWritePos - fwBufferFlashPos;
      uint32_t flashWritten = fwFlashWriteOffset;
      Serial.printf("FW_ACK next=%u RAM=%u/%u Flash=%u bytesSinceLast=%u\n", fwExpectedOffset, ramUsed, FW_BUFFER_SIZE, flashWritten, bytesSinceLastAck);
    }
    esp_now_del_peer(mac);
    lastAckOffset = fwExpectedOffset;
    lastAckTime = now;
  }
}

void EspNowHandler::processFwBuffer() {
  return;
  
  if (!fwBufferActive || !fwBuffer) return;
}

void EspNowHandler::handleFwEnd(const uint8_t* mac, EspNowMessage* msg) {
  Serial.print("FW_END received - firmware update not supported\n");
  sendNack(mac, msg->sequence);
  return;
  
  if (!fwActive) { sendNack(mac, msg->sequence); return; }
  
  processFwBuffer();
  
  uint32_t finalCrc = crc32_finalize(fwCrcAccum);
  if (fwExpectedOffset != fwTotalSize || finalCrc != fwCrcExpected) {
    Serial.print("FW_END mismatch size exp="); Serial.print(fwTotalSize);
    Serial.print(" got=");
    Serial.print(fwExpectedOffset);
    Serial.print("\n");
    Serial.print("FW_END CRC exp="); Serial.print(fwCrcExpected, HEX);
    Serial.print(" got=");
    Serial.print(finalCrc, HEX);
    Serial.print("\n");
    sendNack(mac, msg->sequence);
    return;
  }

  uint8_t vMaj = (uint8_t)fwVersion[0];
  uint8_t vMin = (uint8_t)fwVersion[2];
  uint8_t vPat = (uint8_t)fwVersion[4];
  if (eepromConfig) eepromConfig->setUpdatePending(vMaj, vMin, vPat);

  fwActive = false;
  fwBufferActive = false;
  
  if (fwBuffer) {
    free(fwBuffer);
    fwBuffer = nullptr;
  }

  EspNowMessage ack;
  ack.version = 1;
  ack.type = MSG_FW_ACK;
  ack.sequence = msg->sequence;
  ack.payloadLength = 6;
  ack.payload[0] = fwSessionId & 0xFF;
  ack.payload[1] = (fwSessionId >> 8) & 0xFF;
  ack.payload[2] = fwExpectedOffset & 0xFF;
  ack.payload[3] = (fwExpectedOffset >> 8) & 0xFF;
  ack.payload[4] = (fwExpectedOffset >> 16) & 0xFF;
  ack.payload[5] = (fwExpectedOffset >> 24) & 0xFF;
  ack.checksum = calculateChecksum(ack);
    esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, mac, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;
  esp_err_t addRes3 = esp_now_add_peer(&peerInfo);
  if (addRes3 != ESP_OK && addRes3 != ESP_ERR_ESPNOW_EXIST) {
    Serial.print("FW_END add_peer failed: ");
    Serial.print(esp_err_to_name(addRes3));
    Serial.print("\n");
  }
  esp_err_t sendRes3 = esp_now_send(mac, (uint8_t *)&ack, sizeof(EspNowMessage));
  if (sendRes3 != ESP_OK && sendRes3 != ESP_ERR_ESPNOW_IF) {
    Serial.print("FW_END ack send failed: ");
    Serial.print(esp_err_to_name(sendRes3));
    Serial.print("\n");
  } else {
    Serial.print("FW_ACK end sent\n");
  }
  esp_now_del_peer(mac);

  delay(100);
  ESP.restart();
}

void EspNowHandler::sendAck(const uint8_t* mac, uint16_t sequence) {
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_ACK;
  msg.sequence = sequence;
  msg.payloadLength = 0;
  msg.checksum = calculateChecksum(msg);
  
  esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  
  esp_now_send(mac, (uint8_t *)&msg, sizeof(EspNowMessage));
  esp_now_del_peer(mac);
}

void EspNowHandler::sendNack(const uint8_t* mac, uint16_t sequence) {
  EspNowMessage nack;
  nack.version = 1;
  nack.type = MSG_NACK;
  nack.sequence = sequence;
  nack.payloadLength = 0;
  nack.checksum = calculateChecksum(nack);
  
  esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  
  esp_now_send(mac, (uint8_t *)&nack, sizeof(EspNowMessage));
  esp_now_del_peer(mac);
}

void EspNowHandler::checkTimeout() {
  uint64_t now = millis();
  
  if (currentState != STATE_UNPAIRED && now - lastMasterContact > MASTER_TIMEOUT) {
    Serial.print("Timeout: Lost contact with Master\n");
    currentState = STATE_UNPAIRED;
    lastMasterContact = 0;
  }
}

void EspNowHandler::handleMasterDiscovery(const uint8_t* mac, EspNowMessage* msg) {
  if (currentState == STATE_UNPAIRED && eepromConfig) {
    uint8_t authMAC[6];
    if (eepromConfig->getAuthorizedMAC(authMAC)) {
      if (memcmp(mac, authMAC, 6) == 0) {
        currentState = STATE_LINKED;
        lastMasterContact = millis();
        Serial.print("Detected pairing with authorized master via broadcast\n");
        sendStatus();
        return;
      }
    }
  }
  
  if (currentState == STATE_UNPAIRED) {
    // Only log first discovery, then silently respond
    static bool firstDiscovery = true;
    if (firstDiscovery) {
      Serial.print("Master discovery from ");
      for (int i = 0; i < 6; i++) {
        Serial.printf("%02X", mac[i]);
        if (i < 5) Serial.print(":");
      }
      Serial.print(" - responding to discovery broadcasts\n");
      firstDiscovery = false;
    }
    sendStatus();
  }
}

void EspNowHandler::handlePairRequest(const uint8_t* mac, EspNowMessage* msg) {
  Serial.print("PAIR REQUEST from Master ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.print("\n");
  
  bool authorized = true;
  if (eepromConfig) {
    authorized = eepromConfig->isMACAuthorized(mac);
    
    if (!authorized) {
      Serial.print("PAIR REJECTED: Master MAC not authorized\n");
      sendPairResponse(mac, false);
      sendNack(mac, msg->sequence);
      return;
    }
    
    Serial.print("PAIR ACCEPTED: Master MAC authorized\n");
  } else {
    Serial.print("PAIR ACCEPTED: No EEPROM config - allowing any master\n");
  }
  
  if (currentState == STATE_UNPAIRED) {
    currentState = STATE_LINKED;
    lastMasterContact = millis();
    if (eepromConfig && authorized) {
      uint8_t currentMAC[6];
      if (!eepromConfig->getAuthorizedMAC(currentMAC)) {
        // No MAC set yet, store this one
        eepromConfig->setAuthorizedMAC(mac);
        Serial.print("Stored Master MAC in EEPROM\n");
      }
    }
  }
  
  sendPairResponse(mac, true);
  sendAck(mac, msg->sequence);
}

void EspNowHandler::handleUnpair(const uint8_t* mac, EspNowMessage* msg) {
  Serial.print("UNPAIR request from Master ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.print("\n");

  if (eepromConfig) {
    eepromConfig->clearAuthorizedMAC();
    Serial.print("Cleared authorized Master MAC from EEPROM\n");
  }

  currentState = STATE_UNPAIRED;
  lastMasterContact = 0;
  
  sendAck(mac, msg->sequence);
  Serial.print("Unpaired successfully\n");
}

void EspNowHandler::handlePingRequest(const uint8_t* mac, EspNowMessage* msg) {
  EspNowMessage response;
  response.version = 1;
  response.type = MSG_PING_RESPONSE;
  response.sequence = msg->sequence;
  response.payloadLength = 0;
  response.checksum = calculateChecksum(response);
  
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;
  
  esp_err_t addResult = esp_now_add_peer(&peerInfo);
  if (addResult != ESP_OK && addResult != ESP_ERR_ESPNOW_EXIST) {
    Serial.print("ERROR: Failed to add peer for ping response: ");
    Serial.print(esp_err_to_name(addResult));
    Serial.print("\n");
    return;
  }
  
  esp_err_t result = esp_now_send(mac, (uint8_t *)&response, sizeof(EspNowMessage));
  if (result != ESP_OK && result != ESP_ERR_ESPNOW_IF) {
    Serial.print("ERROR: Failed to send PING response: ");
    Serial.print(esp_err_to_name(result));
    Serial.print("\n");
  }
  
  esp_now_del_peer(mac);
  lastMasterContact = millis();
}

void EspNowHandler::handleCommand(const uint8_t* mac, EspNowMessage* msg) {
  String cmd = String((char*)msg->payload);
  cmd.trim();
  
  Serial.print("COMMAND received: ");
  Serial.print(cmd);
  Serial.print("\n");
  
  commandReceived = true;
  
  if (currentState == STATE_LINKED || currentState == STATE_DISCOVERED) {
    Serial.print("Processing command...\n");
    
    if (cmd == "LED_ON") {
      Serial.print("LED ON executed\n");
    } else if (cmd == "LED_OFF") {
      Serial.print("LED OFF executed\n");
    } else if (cmd == "STATUS") {
      Serial.print("Status requested\n");
    }
  }
  
  sendAck(mac, msg->sequence);
}

void EspNowHandler::onDataReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (!instance) return;
  
  const uint8_t *mac_addr = info->src_addr;
  
  if (len != sizeof(EspNowMessage)) return;
  
  EspNowMessage* msg = (EspNowMessage*)data;
  
  if (msg->checksum != calculateChecksum(*msg)) {
    Serial.print("ERROR: Invalid checksum\n");
    return;
  }
  
  instance->lastMasterContact = millis();
  instance->lastSequence = msg->sequence;
  
  if (instance->currentState == STATE_UNPAIRED && instance->eepromConfig) {
    uint8_t authMAC[6];
    if (instance->eepromConfig->getAuthorizedMAC(authMAC)) {
      if (memcmp(mac_addr, authMAC, 6) == 0) {
        instance->currentState = STATE_LINKED;
        Serial.print("Detected pairing with authorized master\n");
      }
    }
  }
  
  switch (msg->type) {
    case MSG_BROADCAST_DISCOVERY:
      instance->handleMasterDiscovery(mac_addr, msg);
      break;
    case MSG_PAIR_REQUEST:
      instance->handlePairRequest(mac_addr, msg);
      break;
    case MSG_UNPAIR:
      instance->handleUnpair(mac_addr, msg);
      break;
    case MSG_PING_REQUEST:
      instance->handlePingRequest(mac_addr, msg);
      break;
    case MSG_COMMAND:
      instance->handleCommand(mac_addr, msg);
      break;
    case MSG_FW_BEGIN:
      instance->handleFwBegin(mac_addr, msg);
      break;
    case MSG_FW_CHUNK:
      instance->handleFwChunk(mac_addr, msg);
      break;
    case MSG_FW_END:
      instance->handleFwEnd(mac_addr, msg);
      break;
    default:
      Serial.print("WARNING: Unknown message type: ");
      Serial.print(msg->type);
      Serial.print("\n");
      break;
  }
}

void EspNowHandler::onDataSent(const esp_now_send_info_t *info, esp_now_send_status_t status) {
  if (!instance) return;
  
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.print("ERROR: Message send failed\n");
    instance->retryCount++;
  } else {
    instance->retryCount = 0;
  }
}

