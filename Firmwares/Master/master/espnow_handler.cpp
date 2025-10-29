#include "espnow_handler.h"
#include "slave_manager.h"
#include <WiFi.h>
#include <esp_wifi.h>

EspNowHandler espnowHandler;

EspNowHandler::EspNowHandler() : sequenceCounter(0), lastBroadcast(0), broadcastPeerAdded(false) {}

void EspNowHandler::init() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP("LumiRail", NULL, 1, 0, 1);
  
  if (esp_now_init() != ESP_OK) {
    Serial.println("ERROR: Failed to initialize ESP-NOW");
    return;
  }
  
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
  
  esp_now_register_send_cb(onDataSent);
  esp_now_register_recv_cb(onDataReceive);
}

void EspNowHandler::update() {
  uint64_t now = millis();
  if (now - lastBroadcast > BROADCAST_INTERVAL) {
    sendBroadcastDiscovery();
    lastBroadcast = now;
  }
}

void EspNowHandler::sendBroadcastDiscovery() {
  if (!broadcastPeerAdded) {
    uint8_t broadcastAddr[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
    esp_now_peer_info_t peerInfo;
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
  
  esp_now_peer_info_t peerInfo;
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
  
  esp_now_peer_info_t peerInfo;
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
  
  esp_now_peer_info_t peerInfo;
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
  
  esp_now_peer_info_t peerInfo;
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
    esp_now_peer_info_t peerInfo;
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
  }
}

