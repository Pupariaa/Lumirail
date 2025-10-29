#ifndef TLC59116_H
#define TLC59116_H

#include <Wire.h>

#define TLC59116_ADDR_1 0x60
#define TLC59116_ADDR_2 0x68

// Register addresses
#define TLC59116_MODE1 0x00
#define TLC59116_MODE2 0x01
#define TLC59116_PWM0 0x02
#define TLC59116_PWM15 0x11
#define TLC59116_GRPPWM 0x12
#define TLC59116_GRPFREQ 0x13
#define TLC59116_LEDOUT0 0x14
#define TLC59116_LEDOUT1 0x15
#define TLC59116_LEDOUT2 0x16
#define TLC59116_LEDOUT3 0x17

class TLC59116 {
private:
  uint8_t deviceAddr;
  uint8_t sdaPin;
  uint8_t sclPin;
  bool devicePresent;
  
  bool writeRegister(uint8_t reg, uint8_t data);

public:
  TLC59116(uint8_t address);
  bool begin(uint8_t sdaPin = 18, uint8_t sclPin = 19);
  bool setPWM(uint8_t channel, uint8_t value);
  bool setAllPWM(uint8_t value);
  bool setLedoutMode(uint8_t bank, uint8_t mode);
  bool enableAllLedPWM();
  bool allOff();
  bool isPresent() { return devicePresent; }
};

#endif

