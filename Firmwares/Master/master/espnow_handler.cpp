#include "espnow_handler.h"
#include "slave_manager.h"
#include <WiFi.h>
#include <esp_wifi.h>

EspNowHandler espnowHandler;

EspNowHandler::EspNowHandler() : sequenceCounter(0), lastBroadcast(0), broadcastPeerAdded(false), fwActive(false), lastFwAckOffset(0) {
  memset(fwTargetMac, 0, 6);
}

void EspNowHandler::init() {
  // WiFi AP is started in setup()
  
  if (esp_now_init() != ESP_OK) {
    Serial.println("ERROR: Failed to initialize ESP-NOW");
    return;
  }
  
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
  
  esp_now_register_send_cb(onDataSent);
  esp_now_register_recv_cb(onDataReceive);
}

void EspNowHandler::update() {
  // Ne pas envoyer de broadcasts pendant une mise à jour firmware
  if (fwActive) return;
  
  uint64_t now = millis();
  if (now - lastBroadcast > BROADCAST_INTERVAL) {
    sendBroadcastDiscovery();
    lastBroadcast = now;
  }
}

void EspNowHandler::sendBroadcastDiscovery() {
  if (!broadcastPeerAdded) {
    uint8_t broadcastAddr[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
    esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, broadcastAddr, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_AP;
    peerInfo.encrypt = false;
    
    if (esp_now_add_peer(&peerInfo) == ESP_OK) {
      broadcastPeerAdded = true;
    }
  }
  
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_BROADCAST_DISCOVERY;
  msg.sequence = sequenceCounter++;
  msg.payload[0] = slaveManager.getStats()->pairedCount;
  msg.payloadLength = 1;
  msg.checksum = calculateChecksum(msg);
  
  uint8_t broadcastAddr[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  esp_err_t result = esp_now_send(broadcastAddr, (uint8_t *)&msg, sizeof(EspNowMessage));
  
  if (result != ESP_OK && result != ESP_ERR_ESPNOW_IF) {
    broadcastPeerAdded = false;
  }
}

bool EspNowHandler::sendPing(const uint8_t* mac) {
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_PING_REQUEST;
  msg.sequence = sequenceCounter++;
  msg.payloadLength = 0;
  msg.checksum = calculateChecksum(msg);
  
  esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  
  uint32_t start = millis();
  esp_err_t result = esp_now_send(mac, (uint8_t *)&msg, sizeof(EspNowMessage));
  
  if (result == ESP_OK) {
    uint32_t elapsed = millis() - start;
    Serial.print("PING sent (");
    Serial.print(elapsed);
    Serial.println("ms)");
  } else {
    Serial.println("ERROR: Failed to send ping");
  }
  
  esp_now_del_peer(mac);
  return (result == ESP_OK);
}

bool EspNowHandler::sendPairRequest(const uint8_t* mac) {
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_PAIR_REQUEST;
  msg.sequence = sequenceCounter++;
  msg.payloadLength = 0;
  msg.checksum = calculateChecksum(msg);
  
  esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_AP;
  peerInfo.encrypt = false;
  
  esp_err_t addResult = esp_now_add_peer(&peerInfo);
  if (addResult != ESP_OK && addResult != ESP_ERR_ESPNOW_EXIST) {
    Serial.print("ERROR: Failed to add peer for pair request: ");
    Serial.println(esp_err_to_name(addResult));
    return false;
  }
  
  esp_err_t sendResult = esp_now_send(mac, (uint8_t *)&msg, sizeof(EspNowMessage));
  
  if (sendResult == ESP_OK || sendResult == ESP_ERR_ESPNOW_IF) {
    Serial.print("PAIR REQUEST sent to ");
    for (int i = 0; i < 6; i++) {
      Serial.printf("%02X", mac[i]);
      if (i < 5) Serial.print(":");
    }
    Serial.println();
    return true;
  } else {
    Serial.print("ERROR: Failed to send pair request: ");
    Serial.println(esp_err_to_name(sendResult));
    esp_now_del_peer(mac);
    return false;
  }
}

bool EspNowHandler::sendUnpair(const uint8_t* mac) {
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_UNPAIR;
  msg.sequence = sequenceCounter++;
  msg.payloadLength = 0;
  msg.checksum = calculateChecksum(msg);
  
  esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_AP;
  peerInfo.encrypt = false;
  
  esp_err_t addResult = esp_now_add_peer(&peerInfo);
  if (addResult != ESP_OK && addResult != ESP_ERR_ESPNOW_EXIST) {
    Serial.print("ERROR: Failed to add peer for unpair: ");
    Serial.println(esp_err_to_name(addResult));
    return false;
  }
  
  esp_err_t sendResult = esp_now_send(mac, (uint8_t *)&msg, sizeof(EspNowMessage));
  
  if (sendResult == ESP_OK || sendResult == ESP_ERR_ESPNOW_IF) {
    Serial.print("UNPAIR sent to ");
    for (int i = 0; i < 6; i++) {
      Serial.printf("%02X", mac[i]);
      if (i < 5) Serial.print(":");
    }
    Serial.println();
    return true;
  } else {
    Serial.print("ERROR: Failed to send unpair: ");
    Serial.println(esp_err_to_name(sendResult));
    esp_now_del_peer(mac);
    return false;
  }
}

bool EspNowHandler::sendCommand(const uint8_t* mac, const char* command) {
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_COMMAND;
  msg.sequence = sequenceCounter++;
  strncpy((char*)msg.payload, command, 199);
  msg.payloadLength = strlen(command);
  msg.checksum = calculateChecksum(msg);
  
  esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  
  esp_err_t result = esp_now_send(mac, (uint8_t *)&msg, sizeof(EspNowMessage));
  
  if (result == ESP_OK) {
    Serial.print("COMMAND sent: ");
    Serial.println(command);
  } else {
    Serial.println("ERROR: Failed to send command");
  }
  
  esp_now_del_peer(mac);
  return (result == ESP_OK);
}

bool EspNowHandler::sendBroadcastCommand(const char* command) {
  if (!broadcastPeerAdded) {
    uint8_t broadcastAddr[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
    esp_now_peer_info_t peerInfo; memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, broadcastAddr, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_AP;
    peerInfo.encrypt = false;
    
    esp_now_add_peer(&peerInfo);
    broadcastPeerAdded = true;
  }
  
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_COMMAND;
  msg.sequence = sequenceCounter++;
  strncpy((char*)msg.payload, command, 199);
  msg.payloadLength = strlen(command);
  msg.checksum = calculateChecksum(msg);
  
  uint8_t broadcastAddr[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  esp_err_t result = esp_now_send(broadcastAddr, (uint8_t *)&msg, sizeof(EspNowMessage));
  
  if (result == ESP_OK || result == ESP_ERR_ESPNOW_IF) {
    Serial.print("BROADCAST sent: ");
    Serial.println(command);
    return true;
  } else {
    Serial.print("ERROR: Failed to send broadcast command: ");
    Serial.println(esp_err_to_name(result));
    return false;
  }
}

bool EspNowHandler::sendFwBegin(const uint8_t* mac, uint16_t sessionId, const char version[8], uint32_t sizeBytes, uint32_t crc32) {
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_FW_BEGIN;
  msg.sequence = sequenceCounter++;
  uint8_t *p = msg.payload;
  p[0] = sessionId & 0xFF; p[1] = (sessionId >> 8) & 0xFF;
  memcpy(p + 2, version, 8);
  p[10] = sizeBytes & 0xFF; p[11] = (sizeBytes >> 8) & 0xFF; p[12] = (sizeBytes >> 16) & 0xFF; p[13] = (sizeBytes >> 24) & 0xFF;
  p[14] = crc32 & 0xFF; p[15] = (crc32 >> 8) & 0xFF; p[16] = (crc32 >> 16) & 0xFF; p[17] = (crc32 >> 24) & 0xFF;
  msg.payloadLength = 18;
  msg.checksum = calculateChecksum(msg);
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_AP;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  esp_err_t res = esp_now_send(mac, (uint8_t *)&msg, sizeof(EspNowMessage));
  esp_now_del_peer(mac);
  return (res == ESP_OK || res == ESP_ERR_ESPNOW_IF);
}

bool EspNowHandler::sendFwChunk(const uint8_t* mac, uint16_t sessionId, uint32_t offset, const uint8_t* data, uint16_t len, uint32_t chunkCrc32) {
  if (len > 188) len = 188;
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_FW_CHUNK;
  msg.sequence = sequenceCounter++;
  uint8_t *p = msg.payload;
  p[0] = sessionId & 0xFF; p[1] = (sessionId >> 8) & 0xFF;
  p[2] = offset & 0xFF; p[3] = (offset >> 8) & 0xFF; p[4] = (offset >> 16) & 0xFF; p[5] = (offset >> 24) & 0xFF;
  p[6] = len & 0xFF; p[7] = (len >> 8) & 0xFF;
  memcpy(p + 8, data, len);
  p[8 + len] = chunkCrc32 & 0xFF; p[9 + len] = (chunkCrc32 >> 8) & 0xFF; p[10 + len] = (chunkCrc32 >> 16) & 0xFF; p[11 + len] = (chunkCrc32 >> 24) & 0xFF;
  msg.payloadLength = 12 + len;
  msg.checksum = calculateChecksum(msg);
  esp_now_peer_info_t peerInfo;
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_AP;
  peerInfo.encrypt = false;
  esp_err_t addRes = esp_now_add_peer(&peerInfo);
  if (addRes != ESP_OK && addRes != ESP_ERR_ESPNOW_EXIST) {
    Serial.printf("FW_CHUNK add_peer failed: %s\n", esp_err_to_name(addRes));
    return false;
  }
  esp_err_t res = esp_now_send(mac, (uint8_t *)&msg, sizeof(EspNowMessage));
  esp_now_del_peer(mac);
  if (res != ESP_OK && res != ESP_ERR_ESPNOW_IF) {
    Serial.printf("FW_CHUNK send failed: %s (offset=%u)\n", esp_err_to_name(res), offset);
    return false;
  }
  return true;
}

bool EspNowHandler::sendFwEnd(const uint8_t* mac, uint16_t sessionId) {
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_FW_END;
  msg.sequence = sequenceCounter++;
  msg.payload[0] = sessionId & 0xFF; msg.payload[1] = (sessionId >> 8) & 0xFF;
  msg.payloadLength = 2;
  msg.checksum = calculateChecksum(msg);
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_AP;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  esp_err_t res = esp_now_send(mac, (uint8_t *)&msg, sizeof(EspNowMessage));
  esp_now_del_peer(mac);
  return (res == ESP_OK || res == ESP_ERR_ESPNOW_IF);
}

bool EspNowHandler::waitForFwAck(uint32_t expectedOffset, uint32_t timeoutMs) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    if (lastFwAckOffset >= expectedOffset) {
      return true;
    }
    delay(10);
  }
  return false;
}

void EspNowHandler::onDataSent(const esp_now_send_info_t *info, esp_now_send_status_t status) {
  if (status == ESP_NOW_SEND_SUCCESS) {
    slaveManager.getStats()->messagesSent++;
  } else {
    slaveManager.getStats()->messagesLost++;
  }
}

void EspNowHandler::onDataReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  const uint8_t *mac_addr = info->src_addr;
  
  if (len != sizeof(EspNowMessage)) return;
  
  EspNowMessage* msg = (EspNowMessage*)data;
  
  if (msg->checksum != calculateChecksum(*msg)) {
    Serial.println("ERROR: Invalid checksum");
    return;
  }
  
  // Si une mise à jour est en cours, ignorer les messages des autres slaves
  if (espnowHandler.fwActive && memcmp(mac_addr, espnowHandler.getFwTargetMac(), 6) != 0) {
    return;
  }
  
  slaveManager.getStats()->messagesReceived++;
  
  switch (msg->type) {
    case MSG_STATUS_RESPONSE:
      slaveManager.handleSlaveStatus(mac_addr, msg);
      break;
    case MSG_PING_RESPONSE:
      slaveManager.handlePingResponse(mac_addr, msg);
      break;
    case MSG_ACK:
      slaveManager.handleAck(mac_addr, msg);
      break;
    case MSG_NACK:
      slaveManager.handleNack(mac_addr, msg);
      break;
    case MSG_PAIR_RESPONSE:
      slaveManager.handlePairResponse(mac_addr, msg);
      break;
    case MSG_FW_ACK:
      {
        uint16_t sid = (uint16_t)(msg->payload[0] | (msg->payload[1] << 8));
        uint32_t off = (uint32_t)msg->payload[2] | ((uint32_t)msg->payload[3] << 8) | ((uint32_t)msg->payload[4] << 16) | ((uint32_t)msg->payload[5] << 24);
        Serial.printf("FW_ACK session=%u nextOffset=%u\n", sid, off);
        if (espnowHandler.fwActive && memcmp(mac_addr, espnowHandler.getFwTargetMac(), 6) == 0) {
          espnowHandler.setLastFwAckOffset(off);
        }
      }
      break;
    case MSG_FW_ERROR:
      Serial.println("FW_ERROR received");
      break;
  }
}

