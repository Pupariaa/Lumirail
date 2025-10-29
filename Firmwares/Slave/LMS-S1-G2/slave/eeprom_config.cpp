#include "eeprom_config.h"
#include <Arduino.h>
#include <string.h>

EepromConfig::EepromConfig(AT24C02* eeprom) : eeprom(eeprom), initialized(false) {
}

bool EepromConfig::init() {
  if (!eeprom->isPresent()) {
    Serial.println("ERROR: EEPROM not available for configuration");
    return false;
  }
  initialized = true;
  return true;
}

bool EepromConfig::setSerialNumber(const char* serial) {
  if (!initialized || !serial) return false;
  
  uint8_t len = strlen(serial);
  if (len > SERIAL_MAX_LEN) len = SERIAL_MAX_LEN;
  
  uint8_t buffer[8] = {0};
  memcpy(buffer, serial, len);
  // Fill rest with 0xFF to mark as set
  for (uint8_t i = len; i < 8; i++) {
    buffer[i] = 0xFF;
  }
  
  return eeprom->writePage(EEPROM_SERIAL_START, buffer, 8);
}

bool EepromConfig::setModel(const char* model) {
  if (!initialized || !model) return false;
  
  uint8_t len = strlen(model);
  if (len > MODEL_MAX_LEN) len = MODEL_MAX_LEN;
  
  uint8_t buffer[8] = {0};
  memcpy(buffer, model, len);
  // Fill rest with 0xFF to mark as set
  for (uint8_t i = len; i < 8; i++) {
    buffer[i] = 0xFF;
  }
  
  return eeprom->writePage(EEPROM_MODEL_START, buffer, 8);
}

bool EepromConfig::getSerialNumber(char* buffer, uint8_t len) {
  if (!initialized || !buffer || len == 0) return false;
  
  uint8_t data[8];
  if (!eeprom->readBuffer(EEPROM_SERIAL_START, data, 8)) {
    return false;
  }
  
  uint8_t copyLen = 8;
  if (copyLen > len - 1) copyLen = len - 1;
  
  memcpy(buffer, data, copyLen);
  buffer[copyLen] = '\0';
  
  // Remove 0xFF padding
  for (int i = copyLen - 1; i >= 0; i--) {
    if (buffer[i] == 0xFF || buffer[i] == 0) {
      buffer[i] = '\0';
    } else {
      break;
    }
  }
  
  return true;
}

bool EepromConfig::getModel(char* buffer, uint8_t len) {
  if (!initialized || !buffer || len == 0) return false;
  
  uint8_t data[8];
  if (!eeprom->readBuffer(EEPROM_MODEL_START, data, 8)) {
    return false;
  }
  
  uint8_t copyLen = 8;
  if (copyLen > len - 1) copyLen = len - 1;
  
  memcpy(buffer, data, copyLen);
  buffer[copyLen] = '\0';
  
  // Remove 0xFF padding
  for (int i = copyLen - 1; i >= 0; i--) {
    if (buffer[i] == 0xFF || buffer[i] == 0) {
      buffer[i] = '\0';
    } else {
      break;
    }
  }
  
  return true;
}

bool EepromConfig::setAuthorizedMAC(const uint8_t* mac) {
  if (!initialized || !mac) return false;
  
  uint8_t buffer[8] = {0};
  memcpy(buffer, mac, 6);
  buffer[6] = 0xFF;  // Padding
  buffer[7] = 0xFF;  // Padding
  
  return eeprom->writePage(EEPROM_MAC_START, buffer, 8);
}

bool EepromConfig::getAuthorizedMAC(uint8_t* mac) {
  if (!initialized || !mac) return false;
  
  uint8_t data[8];
  if (!eeprom->readBuffer(EEPROM_MAC_START, data, 8)) {
    return false;
  }
  
  // Check if MAC is set (not all 0xFF or 0x00)
  bool isEmpty = true;
  for (uint8_t i = 0; i < 6; i++) {
    if (data[i] != 0xFF && data[i] != 0x00) {
      isEmpty = false;
      break;
    }
  }
  
  if (isEmpty) {
    return false;  // No MAC set
  }
  
  memcpy(mac, data, 6);
  return true;
}

bool EepromConfig::isMACAuthorized(const uint8_t* mac) {
  if (!initialized || !mac) return false;
  
  uint8_t authorizedMAC[6];
  if (!getAuthorizedMAC(authorizedMAC)) {
    // No MAC set means any master is authorized
    return true;
  }
  
  // Compare MAC addresses
  return (memcmp(mac, authorizedMAC, 6) == 0);
}

void EepromConfig::clearAuthorizedMAC() {
  if (!initialized) return;
  
  uint8_t empty[8] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  eeprom->writePage(EEPROM_MAC_START, empty, 8);
}

bool EepromConfig::isSerialSet() {
  if (!initialized) return false;
  
  uint8_t data[8];
  if (!eeprom->readBuffer(EEPROM_SERIAL_START, data, 8)) {
    return false;
  }
  
  // Check if all bytes are 0xFF (not set)
  for (uint8_t i = 0; i < 8; i++) {
    if (data[i] != 0xFF && data[i] != 0x00) {
      return true;  // At least one non-FF byte means it's set
    }
  }
  return false;
}

bool EepromConfig::isModelSet() {
  if (!initialized) return false;
  
  uint8_t data[8];
  if (!eeprom->readBuffer(EEPROM_MODEL_START, data, 8)) {
    return false;
  }
  
  // Check if all bytes are 0xFF (not set)
  for (uint8_t i = 0; i < 8; i++) {
    if (data[i] != 0xFF && data[i] != 0x00) {
      return true;  // At least one non-FF byte means it's set
    }
  }
  return false;
}

