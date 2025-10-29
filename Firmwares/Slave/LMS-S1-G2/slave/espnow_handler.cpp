#include "espnow_handler.h"
#include <WiFi.h>
#include <esp_wifi.h>
#include <string.h>

EspNowHandler espnowHandler;
EspNowHandler* EspNowHandler::instance = nullptr;

EspNowHandler::EspNowHandler() 
  : currentState(STATE_UNPAIRED), 
    lastSequence(0), 
    lastMasterContact(0), 
    lastStatusSent(0), 
    retryCount(0),
    commandReceived(false),
    eepromConfig(nullptr) {
  instance = this;
}

void EspNowHandler::init() {
  init(nullptr);
}

void EspNowHandler::init(EepromConfig* config) {
  eepromConfig = config;
  
  WiFi.mode(WIFI_STA);
  
  if (esp_now_init() != ESP_OK) {
    Serial.println("ERROR: Failed to initialize ESP-NOW");
    return;
  }
  
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
  
  esp_now_register_recv_cb(onDataReceive);
  esp_now_register_send_cb(onDataSent);
  
  WiFi.setSleep(false);
  
  lastStatusSent = millis();
}

void EspNowHandler::update() {
  uint64_t now = millis();
  
  if (currentState == STATE_UNPAIRED) {
    if (now - lastMasterContact > STATUS_INTERVAL && lastMasterContact == 0) {
      Serial.println("Waiting for Master pairing request...");
      lastMasterContact = 1;
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
  
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, broadcastAddr, 6);
  peerInfo.channel = 1;
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;
  
  esp_err_t addResult = esp_now_add_peer(&peerInfo);
  if (addResult != ESP_OK && addResult != ESP_ERR_ESPNOW_EXIST) {
    Serial.print("ERROR: Failed to add peer: ");
    Serial.println(esp_err_to_name(addResult));
    return;
  }
  
  esp_err_t sendResult = esp_now_send(broadcastAddr, (uint8_t *)&msg, sizeof(EspNowMessage));
  if (sendResult != ESP_OK) {
    Serial.print("ERROR: Failed to send status: ");
    Serial.println(esp_err_to_name(sendResult));
    retryCount++;
  }
}

void EspNowHandler::sendPairResponse(const uint8_t* mac, bool accepted) {
  EspNowMessage response;
  response.version = 1;
  response.type = MSG_PAIR_RESPONSE;
  response.sequence = lastSequence;
  response.payload[0] = accepted ? 1 : 0;
  
  // Add serial number if available
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
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  
  esp_now_send(mac, (uint8_t *)&response, sizeof(EspNowMessage));
  esp_now_del_peer(mac);
}

void EspNowHandler::sendAck(const uint8_t* mac, uint16_t sequence) {
  EspNowMessage msg;
  msg.version = 1;
  msg.type = MSG_ACK;
  msg.sequence = sequence;
  msg.payloadLength = 0;
  msg.checksum = calculateChecksum(msg);
  
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 0;
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
  
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  
  esp_now_send(mac, (uint8_t *)&nack, sizeof(EspNowMessage));
  esp_now_del_peer(mac);
}

void EspNowHandler::checkTimeout() {
  uint64_t now = millis();
  
  if (currentState != STATE_UNPAIRED && now - lastMasterContact > MASTER_TIMEOUT) {
    Serial.println("Timeout: Lost contact with Master");
    currentState = STATE_UNPAIRED;
    lastMasterContact = 0;
  }
}

void EspNowHandler::handleMasterDiscovery(const uint8_t* mac, EspNowMessage* msg) {
  // Master broadcast discovery - just respond with status if unpaired
  if (currentState == STATE_UNPAIRED) {
    Serial.print("Master discovery from ");
    for (int i = 0; i < 6; i++) {
      Serial.printf("%02X", mac[i]);
      if (i < 5) Serial.print(":");
    }
    Serial.println(" - sending status response");
    sendStatus();
  }
}

void EspNowHandler::handlePairRequest(const uint8_t* mac, EspNowMessage* msg) {
  Serial.print("PAIR REQUEST from Master ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.println();
  
  // Check if MAC is authorized
  bool authorized = true;
  if (eepromConfig) {
    authorized = eepromConfig->isMACAuthorized(mac);
    
    if (!authorized) {
      Serial.println("PAIR REJECTED: Master MAC not authorized");
      sendPairResponse(mac, false);
      sendNack(mac, msg->sequence);
      return;
    }
    
    Serial.println("PAIR ACCEPTED: Master MAC authorized");
  } else {
    Serial.println("PAIR ACCEPTED: No EEPROM config - allowing any master");
  }
  
  // Accept pairing
  if (currentState == STATE_UNPAIRED) {
    currentState = STATE_DISCOVERED;
    
    // Store authorized MAC if not already set
    if (eepromConfig && authorized) {
      uint8_t currentMAC[6];
      if (!eepromConfig->getAuthorizedMAC(currentMAC)) {
        // No MAC set yet, store this one
        eepromConfig->setAuthorizedMAC(mac);
        Serial.println("Stored Master MAC in EEPROM");
      }
    }
  }
  
  sendPairResponse(mac, true);
  sendAck(mac, msg->sequence);
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
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  
  esp_err_t result = esp_now_send(mac, (uint8_t *)&response, sizeof(EspNowMessage));
  if (result == ESP_OK) {
    Serial.println("PING response sent");
  } else {
    Serial.println("ERROR: Failed to send PING response");
  }
  
  esp_now_del_peer(mac);
}

void EspNowHandler::handleCommand(const uint8_t* mac, EspNowMessage* msg) {
  String cmd = String((char*)msg->payload);
  cmd.trim();
  
  Serial.print("COMMAND received: ");
  Serial.println(cmd);
  
  commandReceived = true;
  
  if (currentState == STATE_LINKED || currentState == STATE_DISCOVERED) {
    Serial.println("Processing command...");
    
    if (cmd == "LED_ON") {
      Serial.println("LED ON executed");
    } else if (cmd == "LED_OFF") {
      Serial.println("LED OFF executed");
    } else if (cmd == "STATUS") {
      Serial.println("Status requested");
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
    Serial.println("ERROR: Invalid checksum");
    return;
  }
  
  instance->lastMasterContact = millis();
  instance->lastSequence = msg->sequence;
  
  switch (msg->type) {
    case MSG_BROADCAST_DISCOVERY:
      instance->handleMasterDiscovery(mac_addr, msg);
      break;
    case MSG_PAIR_REQUEST:
      instance->handlePairRequest(mac_addr, msg);
      break;
    case MSG_PING_REQUEST:
      instance->handlePingRequest(mac_addr, msg);
      break;
    case MSG_COMMAND:
      instance->handleCommand(mac_addr, msg);
      break;
    default:
      Serial.print("WARNING: Unknown message type: ");
      Serial.println(msg->type);
      break;
  }
}

void EspNowHandler::onDataSent(const esp_now_send_info_t *info, esp_now_send_status_t status) {
  if (!instance) return;
  
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("ERROR: Message send failed");
    instance->retryCount++;
  } else {
    instance->retryCount = 0;
  }
}

