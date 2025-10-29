#include "tlc59116.h"

TLC59116::TLC59116(uint8_t address) : deviceAddr(address), sdaPin(18), sclPin(19), devicePresent(false) {
}

bool TLC59116::begin(uint8_t sdaPin, uint8_t sclPin) {
  this->sdaPin = sdaPin;
  this->sclPin = sclPin;
  
  Wire.begin(sdaPin, sclPin);
  Wire.setClock(100000);
  delay(10);
  
  // Check if device is present
  Wire.beginTransmission(deviceAddr);
  uint8_t error = Wire.endTransmission();
  devicePresent = (error == 0);
  
  if (!devicePresent) {
    return false;
  }
  
  // Software reset (send to all call address 0x00)
  Wire.beginTransmission(0x00);
  Wire.write(0xA5);
  Wire.write(0x5A);
  Wire.endTransmission();
  delay(10);
  
  // Configure MODE1: Normal mode, no sub-address, auto-increment disabled
  writeRegister(TLC59116_MODE1, 0x00);
  
  // Configure MODE2: Open-drain outputs
  writeRegister(TLC59116_MODE2, 0x00);
  
  // Enable all LED outputs in PWM mode
  enableAllLedPWM();
  
  // Set all PWM to 0 initially
  allOff();
  
  return true;
}

bool TLC59116::writeRegister(uint8_t reg, uint8_t data) {
  if (!devicePresent) return false;
  
  Wire.beginTransmission(deviceAddr);
  Wire.write(reg);
  Wire.write(data);
  uint8_t error = Wire.endTransmission();
  
  return (error == 0);
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

void TLC59116::enableAllLedPWM() {
  // Each LEDOUT register controls 4 LEDs, 0xFF = all PWM mode
  writeRegister(TLC59116_LEDOUT0, 0xFF);
  writeRegister(TLC59116_LEDOUT1, 0xFF);
  writeRegister(TLC59116_LEDOUT2, 0xFF);
  writeRegister(TLC59116_LEDOUT3, 0xFF);
}

void TLC59116::allOff() {
  setAllPWM(0x00);
}

