#include "lm75a.h"

LM75A::LM75A(uint8_t address) : deviceAddr(address) {
}

bool LM75A::begin(uint8_t sdaPin, uint8_t sclPin) {
  Wire.begin(sdaPin, sclPin);
  Wire.setClock(100000);
  delay(10);
  return checkConnection();
}

bool LM75A::checkConnection() {
  Wire.beginTransmission(deviceAddr);
  return Wire.endTransmission() == 0;
}

bool LM75A::isConnected() {
  return checkConnection();
}

float LM75A::readTemperature() {
  Wire.beginTransmission(deviceAddr);
  Wire.write(LM75A_TEMP_REG);
  uint8_t error = Wire.endTransmission();
  
  if (error != 0) {
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
  
  return -999.0;
}

bool LM75A::writeConfig(uint8_t config) {
  Wire.beginTransmission(deviceAddr);
  Wire.write(LM75A_CONF_REG);
  Wire.write(config);
  uint8_t error = Wire.endTransmission();
  
  return error == 0;
}

uint8_t LM75A::readConfig() {
  Wire.beginTransmission(deviceAddr);
  Wire.write(LM75A_CONF_REG);
  uint8_t error = Wire.endTransmission();
  
  if (error != 0) {
    return 0xFF;
  }

  Wire.requestFrom(deviceAddr, (uint8_t)1);
  if (Wire.available()) {
    return Wire.read();
  }
  
  return 0xFF;
}

