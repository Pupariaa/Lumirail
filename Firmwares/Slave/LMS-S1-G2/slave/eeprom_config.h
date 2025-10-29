#ifndef EEPROM_CONFIG_H
#define EEPROM_CONFIG_H

#include "at24c02.h"
#include <stdint.h>

// EEPROM layout (256 bytes total, 8 bytes per page)
#define EEPROM_SERIAL_START  0x00  // 8 bytes: Serial number (page 0)
#define EEPROM_MODEL_START   0x08  // 8 bytes: Model name (page 1)
#define EEPROM_MAC_START     0xF0  // 16 bytes: Authorized master MAC (6 bytes MAC + 10 bytes reserved for future use) (pages 30-31)

#define SERIAL_MAX_LEN  7  // Null-terminated string
#define MODEL_MAX_LEN   7  // Null-terminated string

class EepromConfig {
private:
  AT24C02* eeprom;
  bool initialized;

public:
  EepromConfig(AT24C02* eeprom);
  bool init();
  
  // Serial number and model (write once, read many)
  bool setSerialNumber(const char* serial);
  bool setModel(const char* model);
  bool getSerialNumber(char* buffer, uint8_t len);
  bool getModel(char* buffer, uint8_t len);
  
  // Authorized master MAC
  bool setAuthorizedMAC(const uint8_t* mac);
  bool getAuthorizedMAC(uint8_t* mac);
  bool isMACAuthorized(const uint8_t* mac);
  void clearAuthorizedMAC();  // Allow any master
  
  // Check if serial/model are set (not all 0xFF)
  bool isSerialSet();
  bool isModelSet();
};

#endif

