#pragma once
#include <Arduino.h>
#include <SPI.h>

class W25Q {
public:
  W25Q(uint8_t csPin, uint8_t mosiPin, uint8_t misoPin, uint8_t sckPin);
  bool begin();
  bool isPresent() const;
  bool readJedecId(uint8_t &manuf, uint8_t &memType, uint8_t &capacity);
  bool readUniqueId(uint8_t uid[8]);
  bool readData(uint32_t addr, uint8_t *buf, size_t len);
  bool pageProgram(uint32_t addr, const uint8_t *data, size_t len);
  bool sectorErase4K(uint32_t addr);
  bool eraseRange(uint32_t addr, size_t len);
  bool writeRange(uint32_t addr, const uint8_t *data, size_t len, bool verify = true);
  uint32_t sizeBytes() const;

private:
  bool writeEnable();
  uint8_t readStatus1();
  bool waitWhileBusy(uint32_t timeoutMs = 5000);
  void select();
  void deselect();

  SPIClass spi;
  uint8_t pinCS;
  uint8_t pinMOSI;
  uint8_t pinMISO;
  uint8_t pinSCK;
  bool present;
  uint8_t jedecManuf;
  uint8_t jedecType;
  uint8_t jedecCapacity;
};


