#ifndef AT24C02_H
#define AT24C02_H

#include <Wire.h>

#define AT24C02_ADDR 0x50
#define AT24C02_PAGE_SIZE 8
#define AT24C02_MEMORY_SIZE 256

class AT24C02 {
private:
  uint8_t deviceAddr;
  uint8_t sdaPin;
  uint8_t sclPin;
  bool devicePresent;
  bool checkConnection();
  void resetBus();

public:
  AT24C02(uint8_t address = AT24C02_ADDR);
  bool begin(uint8_t sdaPin = 18, uint8_t sclPin = 19);
  bool writeByte(uint8_t address, uint8_t data);
  uint8_t readByte(uint8_t address);
  bool writePage(uint8_t startAddress, uint8_t* data, uint8_t length);
  bool readBuffer(uint8_t startAddress, uint8_t* buffer, uint8_t length);
  bool isConnected();
  bool isPresent() { return devicePresent; }
};

#endif

