#include "tlc59116.h"
#include <Arduino.h>

TLC59116::TLC59116(uint8_t address) : deviceAddr(address), sdaPin(18), sclPin(19), devicePresent(false) {
}

bool TLC59116::begin(uint8_t sdaPin, uint8_t sclPin) {
  this->sdaPin = sdaPin;
  this->sclPin = sclPin;
  
  Wire.begin(sdaPin, sclPin);
  Wire.setClock(100000);
  Wire.setTimeOut(1000);
  delay(10);
  
  devicePresent = false;
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(deviceAddr);
    uint8_t error = Wire.endTransmission(true);
    
    if (error == 0) {
      devicePresent = true;
      break;
    }
    
    if (error == 2 || error == 3) {
      Wire.end();
      delay(1);
      Wire.begin(sdaPin, sclPin);
      Wire.setClock(100000);
      delay(1);
    }
    
    if (retry < 2) {
      delay(2);
    }
  }
  
  if (!devicePresent) {
    Serial.print("ERROR: TLC59116 at 0x");
    Serial.print(deviceAddr, HEX);
    Serial.print(" not responding\n");
    return false;
  }
  
  // Serial.print("OK: TLC59116 at 0x");
  // Serial.print(deviceAddr, HEX);
  // Serial.println(" responding");
  
  // Software reset (send to all call address 0x00)
  // Note: Error 4 (timeout) is normal for all-call address, ignore it
  Wire.beginTransmission(0x00);
  Wire.write(0xA5);
  Wire.write(0x5A);
  uint8_t resetError = Wire.endTransmission();
  // Error 4 (timeout) is expected for all-call address reset, only log other errors
  if (resetError != 0 && resetError != 4) {
    Serial.print("WARNING: Software reset issue for 0x");
    Serial.print(deviceAddr, HEX);
    Serial.print(" (error: ");
    Serial.print(resetError);
    Serial.print(")\n");
  }
  delay(10);
  
  // Configure MODE1: Normal mode
  if (!writeRegister(PCA985PW_MODE1, 0x00)) {
    Serial.print("ERROR: Failed to write MODE1 to 0x");
    Serial.print(deviceAddr, HEX);
    Serial.print("\n");
    return false;
  }
  
  delay(10);
  
  // Configure MODE2: Totem pole outputs
  if (!writeRegister(PCA985PW_MODE2, 0x04)) {
    Serial.print("ERROR: Failed to write MODE2 to 0x");
    Serial.print(deviceAddr, HEX);
    Serial.print("\n");
    return false;
  }
  
  // Set all PWM to 0 initially
  if (!allOff()) {
    Serial.print("WARNING: Failed to turn off all LEDs for 0x");
    Serial.print(deviceAddr, HEX);
    Serial.print("\n");
  }
  
  // Serial.print("OK: TLC59116 at 0x");
  // Serial.print(deviceAddr, HEX);
  // Serial.println(" fully initialized");
  
  return true;
}

bool TLC59116::writeRegister(uint8_t reg, uint8_t data) {
  if (!devicePresent) return false;
  
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(deviceAddr);
    Wire.write(reg);
    Wire.write(data);
    uint8_t error = Wire.endTransmission(true);
    
    if (error == 0) {
      return true;
    }
    
    if (error == 2 || error == 3) {
      Wire.end();
      delay(1);
      Wire.begin(sdaPin, sclPin);
      Wire.setClock(100000);
      Wire.setTimeOut(1000);
      delay(1);
    }
    
    if (retry < 2) {
      delay(2);
    }
  }
  
  return false;
}

bool TLC59116::setPWM(uint8_t channel, uint8_t value) {
  if (channel > 15) return false;
  
  uint16_t pwmValue = ((uint16_t)value * 4095) / 255;
  
  uint8_t onLow = 0x06 + (channel * 4);
  uint8_t onHigh = 0x07 + (channel * 4);
  uint8_t offLow = 0x08 + (channel * 4);
  uint8_t offHigh = 0x09 + (channel * 4);
  
  bool r1 = writeRegister(onLow, 0x00);
  delayMicroseconds(200);
  bool r2 = writeRegister(onHigh, 0x00);
  delayMicroseconds(200);
  bool r3 = writeRegister(offLow, pwmValue & 0xFF);
  delayMicroseconds(200);
  bool r4 = writeRegister(offHigh, (pwmValue >> 8) & 0xFF);
  
  bool success = r1 && r2 && r3 && r4;
  
  return success;
}

bool TLC59116::setAllPWM(uint8_t value) {
  if (!devicePresent) return false;
  
  uint16_t pwmValue = ((uint16_t)value * 4095) / 255;
  
  bool success = true;
  for (uint8_t ch = 0; ch < 16; ch++) {
    uint8_t onLow = 0x06 + (ch * 4);
    uint8_t onHigh = 0x07 + (ch * 4);
    uint8_t offLow = 0x08 + (ch * 4);
    uint8_t offHigh = 0x09 + (ch * 4);
    success &= writeRegister(onLow, 0x00);
    delayMicroseconds(100);
    success &= writeRegister(onHigh, 0x00);
    delayMicroseconds(100);
    success &= writeRegister(offLow, pwmValue & 0xFF);
    delayMicroseconds(100);
    success &= writeRegister(offHigh, (pwmValue >> 8) & 0xFF);
    delayMicroseconds(100);
  }
  
  return success;
}

bool TLC59116::setLedoutMode(uint8_t bank, uint8_t mode) {
  return true;
}

bool TLC59116::enableAllLedPWM() {
  return true;
}

bool TLC59116::allOff() {
  if (!devicePresent) return false;
  
  bool success = true;
  for (uint8_t ch = 0; ch < 16; ch++) {
    uint8_t onLow = 0x06 + (ch * 4);
    uint8_t onHigh = 0x07 + (ch * 4);
    uint8_t offLow = 0x08 + (ch * 4);
    uint8_t offHigh = 0x09 + (ch * 4);
    success &= writeRegister(onLow, 0x00);
    delayMicroseconds(100);
    success &= writeRegister(onHigh, 0x00);
    delayMicroseconds(100);
    success &= writeRegister(offLow, 0x00);
    delayMicroseconds(100);
    success &= writeRegister(offHigh, 0x00);
    delayMicroseconds(100);
  }
  
  return success;
}

