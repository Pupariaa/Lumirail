#include "lm75a.h"

LM75A::LM75A(uint8_t address) : deviceAddr(address), sdaPin(18), sclPin(19) {
}

void LM75A::resetBus() {
  Wire.end();
  delay(1);
  Wire.begin(sdaPin, sclPin);
  Wire.setClock(100000);
}

bool LM75A::begin(uint8_t sdaPin, uint8_t sclPin) {
  this->sdaPin = sdaPin;
  this->sclPin = sclPin;
  Wire.begin(sdaPin, sclPin);
  Wire.setClock(100000);
  delay(10);
  return checkConnection();
}

bool LM75A::checkConnection() {
  Wire.beginTransmission(deviceAddr);
  uint8_t error = Wire.endTransmission();
  
  if (error == 2 || error == 3) {
    resetBus();
  }
  
  return error == 0;
}

bool LM75A::isConnected() {
  return checkConnection();
}

float LM75A::readTemperature() {
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(deviceAddr);
    Wire.write(LM75A_TEMP_REG);
    uint8_t error = Wire.endTransmission();
    
    if (error != 0) {
      if (error == 2 || error == 3) {
        Wire.end();
        delay(1);
        Wire.begin(18, 19);
        Wire.setClock(100000);
      }
      if (retry < 2) {
        delay(1);
        continue;
      }
      return -999.0;
    }

    Wire.requestFrom(deviceAddr, (uint8_t)2);
    if (Wire.available() >= 2) {
      int16_t raw = (Wire.read() << 8) | Wire.read();
      raw = raw >> 5;
      
      if (raw & 0x400) {
        raw |= 0xF800;
      }
      
      return raw * 0.125;
    }
    
    if (retry < 2) {
      delay(1);
    }
  }
  
  return -999.0;
}

bool LM75A::writeConfig(uint8_t config) {
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(deviceAddr);
    Wire.write(LM75A_CONF_REG);
    Wire.write(config);
    uint8_t error = Wire.endTransmission();
    
    if (error == 0) {
      return true;
    }
    
    if (error == 2 || error == 3) {
      Wire.end();
      delay(1);
      Wire.begin(18, 19);
      Wire.setClock(100000);
    }
    
    if (retry < 2) {
      delay(1);
    }
  }
  
  return false;
}

uint8_t LM75A::readConfig() {
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(deviceAddr);
    Wire.write(LM75A_CONF_REG);
    uint8_t error = Wire.endTransmission();
    
    if (error != 0) {
      if (error == 2 || error == 3) {
        Wire.end();
        delay(1);
        Wire.begin(18, 19);
        Wire.setClock(100000);
      }
      if (retry < 2) {
        delay(1);
        continue;
      }
      return 0xFF;
    }

    Wire.requestFrom(deviceAddr, (uint8_t)1);
    if (Wire.available()) {
      return Wire.read();
    }
    
    if (retry < 2) {
      delay(1);
    }
  }
  
  return 0xFF;
}

