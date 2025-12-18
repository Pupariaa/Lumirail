#include "eeprom_config.h"
#include <Arduino.h>
#include <string.h>

EepromConfig::EepromConfig(AT24C02* eeprom) : eeprom(eeprom), initialized(false) {
}

bool EepromConfig::init() {
  if (!eeprom->isPresent()) {
    Serial.print("ERROR: EEPROM not available for configuration\n");
    return false;
  }
  initialized = true;
  return true;
}

bool EepromConfig::setSerialNumber(const char* serial) {
  if (!initialized || !serial) return false;
  
  uint8_t len = strlen(serial);
  if (len > SERIAL_MAX_LEN) len = SERIAL_MAX_LEN;
  
  uint8_t buffer[8] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  memcpy(buffer, serial, len);
  // Keep 0xFF padding for remaining bytes (already initialized)
  
  Serial.print("Writing serial number to EEPROM: ");
  Serial.print(serial);
  Serial.print(" (");
  for (uint8_t i = 0; i < 8; i++) {
    Serial.print("0x");
    if (buffer[i] < 16) Serial.print("0");
    Serial.print(buffer[i], HEX);
    if (i < 7) Serial.print(" ");
  }
  Serial.print(")\n");
  
  bool result = eeprom->writePage(EEPROM_SERIAL_START, buffer, 8);
  delay(10);  // Ensure write completes
  
  // Verify write
  uint8_t verify[8];
  if (eeprom->readBuffer(EEPROM_SERIAL_START, verify, 8)) {
    bool match = true;
    for (uint8_t i = 0; i < 8; i++) {
      if (verify[i] != buffer[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      Serial.print("Serial number verified OK\n");
    } else {
      Serial.print("ERROR: Serial number verification failed! Read: ");
      for (uint8_t i = 0; i < 8; i++) {
        Serial.print("0x");
        if (verify[i] < 16) Serial.print("0");
        Serial.print(verify[i], HEX);
        if (i < 7) Serial.print(" ");
      }
      Serial.print("\n");
      result = false;
    }
  }
  
  return result;
}

bool EepromConfig::setModel(const char* model) {
  if (!initialized || !model) return false;
  
  uint8_t len = strlen(model);
  if (len > MODEL_MAX_LEN) len = MODEL_MAX_LEN;
  
  uint8_t buffer[8] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  memcpy(buffer, model, len);
  // Keep 0xFF padding for remaining bytes (already initialized)
  
  Serial.print("Writing model to EEPROM: ");
  Serial.print(model);
  Serial.print(" (");
  for (uint8_t i = 0; i < 8; i++) {
    Serial.print("0x");
    if (buffer[i] < 16) Serial.print("0");
    Serial.print(buffer[i], HEX);
    if (i < 7) Serial.print(" ");
  }
  Serial.print(")\n");
  
  bool result = eeprom->writePage(EEPROM_MODEL_START, buffer, 8);
  delay(10);  // Ensure write completes
  
  // Verify write
  uint8_t verify[8];
  if (eeprom->readBuffer(EEPROM_MODEL_START, verify, 8)) {
    bool match = true;
    for (uint8_t i = 0; i < 8; i++) {
      if (verify[i] != buffer[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      Serial.print("Model verified OK\n");
    } else {
      Serial.print("ERROR: Model verification failed! Read: ");
      for (uint8_t i = 0; i < 8; i++) {
        Serial.print("0x");
        if (verify[i] < 16) Serial.print("0");
        Serial.print(verify[i], HEX);
        if (i < 7) Serial.print(" ");
      }
      Serial.print("\n");
      result = false;
    }
  }
  
  return result;
}

bool EepromConfig::getSerialNumber(char* buffer, uint8_t len) {
  if (!initialized || !buffer || len == 0) return false;
  
  uint8_t data[8];
  if (!eeprom->readBuffer(EEPROM_SERIAL_START, data, 8)) {
    return false;
  }
  
  // Debug: print raw bytes
  Serial.print("EEPROM Serial raw bytes: ");
  for (uint8_t i = 0; i < 8; i++) {
    Serial.print("0x");
    if (data[i] < 16) Serial.print("0");
    Serial.print(data[i], HEX);
    if (i < 7) Serial.print(" ");
  }
  Serial.print("\n");
  
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
  
  Serial.print("EEPROM Serial parsed: '");
  Serial.print(buffer);
  Serial.print("'\n");
  
  return true;
}

bool EepromConfig::getModel(char* buffer, uint8_t len) {
  if (!initialized || !buffer || len == 0) return false;
  
  uint8_t data[8];
  if (!eeprom->readBuffer(EEPROM_MODEL_START, data, 8)) {
    return false;
  }
  
  // Debug: print raw bytes
  Serial.print("EEPROM Model raw bytes: ");
  for (uint8_t i = 0; i < 8; i++) {
    Serial.print("0x");
    if (data[i] < 16) Serial.print("0");
    Serial.print(data[i], HEX);
    if (i < 7) Serial.print(" ");
  }
  Serial.print("\n");
  
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
  
  Serial.print("EEPROM Model parsed: '");
  Serial.print(buffer);
  Serial.print("'\n");
  
  return true;
}

bool EepromConfig::setAuthorizedMAC(const uint8_t* mac) {
  if (!initialized || !mac) return false;
  
  uint8_t buffer[16] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  memcpy(buffer, mac, 6);
  // Bytes 6-15 reserved for future use (keep as 0xFF)
  
  // Write 2 pages (16 bytes)
  bool page1 = eeprom->writePage(EEPROM_MAC_START, buffer, 8);
  delay(10);
  bool page2 = eeprom->writePage(EEPROM_MAC_START + 8, &buffer[8], 8);
  
  return page1 && page2;
}

bool EepromConfig::getAuthorizedMAC(uint8_t* mac) {
  if (!initialized || !mac) return false;
  
  uint8_t data[16];
  if (!eeprom->readBuffer(EEPROM_MAC_START, data, 16)) {
    return false;
  }
  
  // Check if MAC is set (not all 0xFF or 0x00 in first 6 bytes)
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
  
  uint8_t empty[16] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
                       0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  eeprom->writePage(EEPROM_MAC_START, empty, 8);
  delay(10);
  eeprom->writePage(EEPROM_MAC_START + 8, &empty[8], 8);
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

bool EepromConfig::setUpdatePending(uint8_t vMajor, uint8_t vMinor, uint8_t vPatch) {
  if (!initialized) return false;
  uint8_t page[8];
  page[0] = 0xB7;
  page[1] = 0xA5;
  page[2] = 0x00;
  page[3] = vMajor;
  page[4] = vMinor;
  page[5] = vPatch;
  page[6] = page[0] ^ page[1] ^ page[2] ^ page[3] ^ page[4] ^ page[5];
  page[7] = 0x00;
  if (!eeprom->writePage(EEPROM_UPDATE_FLAG, page, 8)) return false;
  delay(10);
  uint8_t verify[8];
  if (!eeprom->readBuffer(EEPROM_UPDATE_FLAG, verify, 8)) return false;
  for (uint8_t i = 0; i < 8; i++) if (verify[i] != page[i]) return false;
  return true;
}

bool EepromConfig::setUpdateApplying(uint8_t vMajor, uint8_t vMinor, uint8_t vPatch) {
  if (!initialized) return false;
  uint8_t page[8];
  page[0] = 0xB7;
  page[1] = 0x5A;
  page[2] = 0x00;
  page[3] = vMajor;
  page[4] = vMinor;
  page[5] = vPatch;
  page[6] = page[0] ^ page[1] ^ page[2] ^ page[3] ^ page[4] ^ page[5];
  page[7] = 0x00;
  if (!eeprom->writePage(EEPROM_UPDATE_FLAG, page, 8)) return false;
  delay(10);
  uint8_t verify[8];
  if (!eeprom->readBuffer(EEPROM_UPDATE_FLAG, verify, 8)) return false;
  for (uint8_t i = 0; i < 8; i++) if (verify[i] != page[i]) return false;
  return true;
}

bool EepromConfig::clearUpdateFlag() {
  if (!initialized) return false;
  uint8_t page[8] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
  if (!eeprom->writePage(EEPROM_UPDATE_FLAG, page, 8)) return false;
  delay(10);
  uint8_t verify[8];
  if (!eeprom->readBuffer(EEPROM_UPDATE_FLAG, verify, 8)) return false;
  for (uint8_t i = 0; i < 8; i++) if (verify[i] != page[i]) return false;
  return true;
}

bool EepromConfig::readUpdateFlag(uint8_t &state, uint8_t &reason, uint8_t &vMajor, uint8_t &vMinor, uint8_t &vPatch) {
  if (!initialized) return false;
  uint8_t page[8];
  if (!eeprom->readBuffer(EEPROM_UPDATE_FLAG, page, 8)) return false;
  if (page[0] != 0xB7) return false;
  uint8_t chk = page[0] ^ page[1] ^ page[2] ^ page[3] ^ page[4] ^ page[5];
  if (chk != page[6]) return false;
  state = page[1];
  reason = page[2];
  vMajor = page[3];
  vMinor = page[4];
  vPatch = page[5];
  return true;
}

