#include "at24c02.h"

AT24C02::AT24C02(uint8_t address) : deviceAddr(address) {
}

bool AT24C02::begin(uint8_t sdaPin, uint8_t sclPin) {
  Wire.begin(sdaPin, sclPin);
  Wire.setClock(100000);
  delay(10);
  return checkConnection();
}

bool AT24C02::checkConnection() {
  Wire.beginTransmission(deviceAddr);
  return Wire.endTransmission() == 0;
}

bool AT24C02::isConnected() {
  return checkConnection();
}

bool AT24C02::writeByte(uint8_t address, uint8_t data) {
  if (address >= AT24C02_MEMORY_SIZE) {
    return false;
  }

  Wire.beginTransmission(deviceAddr);
  Wire.write(address);
  Wire.write(data);
  uint8_t error = Wire.endTransmission();
  
  if (error == 0) {
    delay(5);
    return true;
  }
  return false;
}

uint8_t AT24C02::readByte(uint8_t address) {
  if (address >= AT24C02_MEMORY_SIZE) {
    return 0xFF;
  }

  Wire.beginTransmission(deviceAddr);
  Wire.write(address);
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

bool AT24C02::writePage(uint8_t startAddress, uint8_t* data, uint8_t length) {
  if (startAddress >= AT24C02_MEMORY_SIZE || length == 0) {
    return false;
  }

  if (startAddress + length > AT24C02_MEMORY_SIZE) {
    length = AT24C02_MEMORY_SIZE - startAddress;
  }

  uint8_t pageStart = (startAddress / AT24C02_PAGE_SIZE) * AT24C02_PAGE_SIZE;
  uint8_t pageEnd = pageStart + AT24C02_PAGE_SIZE;
  uint8_t bytesWritten = 0;

  while (bytesWritten < length) {
    uint8_t currentAddr = startAddress + bytesWritten;
    uint8_t bytesToWrite = min((uint8_t)(pageEnd - currentAddr), (uint8_t)(length - bytesWritten));

    Wire.beginTransmission(deviceAddr);
    Wire.write(currentAddr);
    for (uint8_t i = 0; i < bytesToWrite; i++) {
      Wire.write(data[bytesWritten + i]);
    }
    uint8_t error = Wire.endTransmission();
    
    if (error != 0) {
      return false;
    }
    
    delay(5);
    bytesWritten += bytesToWrite;
    
    if (currentAddr + bytesToWrite >= pageEnd) {
      pageStart = pageEnd;
      pageEnd += AT24C02_PAGE_SIZE;
    }
  }
  
  return true;
}

bool AT24C02::readBuffer(uint8_t startAddress, uint8_t* buffer, uint8_t length) {
  if (startAddress >= AT24C02_MEMORY_SIZE || length == 0 || buffer == nullptr) {
    return false;
  }

  if (startAddress + length > AT24C02_MEMORY_SIZE) {
    length = AT24C02_MEMORY_SIZE - startAddress;
  }

  Wire.beginTransmission(deviceAddr);
  Wire.write(startAddress);
  uint8_t error = Wire.endTransmission();
  
  if (error != 0) {
    return false;
  }

  Wire.requestFrom(deviceAddr, length);
  for (uint8_t i = 0; i < length && Wire.available(); i++) {
    buffer[i] = Wire.read();
  }
  
  return true;
}

