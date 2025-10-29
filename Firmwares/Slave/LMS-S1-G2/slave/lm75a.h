#ifndef LM75A_H
#define LM75A_H

#include <Wire.h>

#define LM75A_TEMP_REG 0x00
#define LM75A_CONF_REG 0x01
#define LM75A_THYST_REG 0x02
#define LM75A_TOS_REG 0x03

#define LM75A_ADDR_POWER 0x4C
#define LM75A_ADDR_LED1 0x48
#define LM75A_ADDR_LED2 0x4E

class LM75A {
private:
  uint8_t deviceAddr;
  uint8_t sdaPin;
  uint8_t sclPin;
  bool devicePresent;
  bool checkConnection();
  void resetBus();

public:
  LM75A(uint8_t address);
  bool begin(uint8_t sdaPin = 18, uint8_t sclPin = 19);
  float readTemperature();
  bool isConnected();
  bool isPresent() { return devicePresent; }
  bool writeConfig(uint8_t config);
  uint8_t readConfig();
};

#endif

