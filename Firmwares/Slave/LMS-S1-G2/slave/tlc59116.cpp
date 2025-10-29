#include "tlc59116.h"

TLC59116::TLC59116(uint8_t address) : deviceAddr(address), sdaPin(18), sclPin(19), devicePresent(false) {
}

bool TLC59116::begin(uint8_t sdaPin, uint8_t sclPin) {
  this->sdaPin = sdaPin;
  this->sclPin = sclPin;
  
  Wire.begin(sdaPin, sclPin);
  Wire.setClock(100000);
  delay(10);
  
  // Check if device is present (with retry)
  devicePresent = false;
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(deviceAddr);
    uint8_t error = Wire.endTransmission();
    
    if (error == 0) {
      devicePresent = true;
      break;
    }
    
    if (error == 2 || error == 3) {
      // NACK error - reset bus
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
    Serial.println(" not responding");
    return false;
  }
  
  Serial.print("OK: TLC59116 at 0x");
  Serial.print(deviceAddr, HEX);
  Serial.println(" responding");
  
  // Software reset (send to all call address 0x00)
  Wire.beginTransmission(0x00);
  Wire.write(0xA5);
  Wire.write(0x5A);
  uint8_t resetError = Wire.endTransmission();
  if (resetError != 0) {
    Serial.print("WARNING: Software reset failed for 0x");
    Serial.print(deviceAddr, HEX);
    Serial.print(" (error: ");
    Serial.print(resetError);
    Serial.println(")");
  }
  delay(10);
  
  // Configure MODE1: Normal mode, no sub-address, auto-increment disabled
  if (!writeRegister(TLC59116_MODE1, 0x00)) {
    Serial.print("ERROR: Failed to write MODE1 to 0x");
    Serial.println(deviceAddr, HEX);
    return false;
  }
  
  // Configure MODE2: Open-drain outputs
  if (!writeRegister(TLC59116_MODE2, 0x00)) {
    Serial.print("ERROR: Failed to write MODE2 to 0x");
    Serial.println(deviceAddr, HEX);
    return false;
  }
  
  // Enable all LED outputs in PWM mode
  if (!enableAllLedPWM()) {
    Serial.print("ERROR: Failed to configure LEDOUT registers for 0x");
    Serial.println(deviceAddr, HEX);
    return false;
  }
  
  // Set all PWM to 0 initially
  if (!allOff()) {
    Serial.print("WARNING: Failed to turn off all LEDs for 0x");
    Serial.println(deviceAddr, HEX);
  }
  
  Serial.print("OK: TLC59116 at 0x");
  Serial.print(deviceAddr, HEX);
  Serial.println(" fully initialized");
  
  return true;
}

bool TLC59116::writeRegister(uint8_t reg, uint8_t data) {
  if (!devicePresent) return false;
  
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(deviceAddr);
    Wire.write(reg);
    Wire.write(data);
    uint8_t error = Wire.endTransmission();
    
    if (error == 0) {
      return true;
    }
    
    if (error == 2 || error == 3) {
      // NACK error - reset bus
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
  
  return false;
}

bool TLC59116::setPWM(uint8_t channel, uint8_t value) {
  if (channel > 15) return false;
  return writeRegister(TLC59116_PWM0 + channel, value);
}

bool TLC59116::setAllPWM(uint8_t value) {
  if (!devicePresent) return false;
  
  for (uint8_t i = 0; i < 16; i++) {
    if (!writeRegister(TLC59116_PWM0 + i, value)) {
      return false;
    }
  }
  return true;
}

bool TLC59116::setLedoutMode(uint8_t bank, uint8_t mode) {
  if (bank > 3) return false;
  return writeRegister(TLC59116_LEDOUT0 + bank, mode);
}

bool TLC59116::enableAllLedPWM() {
  // Each LEDOUT register controls 4 LEDs, 0xFF = all PWM mode
  bool success = true;
  success &= writeRegister(TLC59116_LEDOUT0, 0xFF);
  success &= writeRegister(TLC59116_LEDOUT1, 0xFF);
  success &= writeRegister(TLC59116_LEDOUT2, 0xFF);
  success &= writeRegister(TLC59116_LEDOUT3, 0xFF);
  return success;
}

bool TLC59116::allOff() {
  return setAllPWM(0x00);
}

