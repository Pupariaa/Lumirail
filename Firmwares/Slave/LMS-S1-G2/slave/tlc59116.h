#ifndef TLC59116_H
#define TLC59116_H

#include <Wire.h>

#define PCA985PW_ADDR_1 0x40
#define PCA985PW_ADDR_2 0x60

// Register addresses (PCA985PW)
#define PCA985PW_MODE1 0x00
#define PCA985PW_MODE2 0x01
#define PCA985PW_PWM0_L 0x08
#define PCA985PW_PWM0_H 0x09
#define PCA985PW_PWM1_L 0x0A
#define PCA985PW_PWM1_H 0x0B
#define PCA985PW_PWM2_L 0x0C
#define PCA985PW_PWM2_H 0x0D
#define PCA985PW_PWM3_L 0x0E
#define PCA985PW_PWM3_H 0x0F
#define PCA985PW_PWM4_L 0x10
#define PCA985PW_PWM4_H 0x11
#define PCA985PW_PWM5_L 0x12
#define PCA985PW_PWM5_H 0x13
#define PCA985PW_PWM6_L 0x14
#define PCA985PW_PWM6_H 0x15
#define PCA985PW_PWM7_L 0x16
#define PCA985PW_PWM7_H 0x17
#define PCA985PW_PWM8_L 0x18
#define PCA985PW_PWM8_H 0x19
#define PCA985PW_PWM9_L 0x1A
#define PCA985PW_PWM9_H 0x1B
#define PCA985PW_PWM10_L 0x1C
#define PCA985PW_PWM10_H 0x1D
#define PCA985PW_PWM11_L 0x1E
#define PCA985PW_PWM11_H 0x1F
#define PCA985PW_PWM12_L 0x20
#define PCA985PW_PWM12_H 0x21
#define PCA985PW_PWM13_L 0x22
#define PCA985PW_PWM13_H 0x23
#define PCA985PW_PWM14_L 0x24
#define PCA985PW_PWM14_H 0x25
#define PCA985PW_PWM15_L 0x26
#define PCA985PW_PWM15_H 0x27

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

