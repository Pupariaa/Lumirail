#ifndef WS2812B_H
#define WS2812B_H

#include <stdint.h>

#define WS2812B_PIN 4

class WS2812B {
private:
  uint8_t pin;
  uint8_t numLeds;
  uint8_t* buffer;
  bool initialized;

  void sendByte(uint8_t byte);
  void sendBit(bool bit);

public:
  WS2812B(uint8_t pin = WS2812B_PIN, uint8_t numLeds = 1);
  ~WS2812B();
  bool begin();
  void setPixel(uint8_t index, uint8_t r, uint8_t g, uint8_t b);
  void setPixel(uint8_t index, uint32_t color);
  void setPixelDimmed(uint8_t index, uint8_t r, uint8_t g, uint8_t b, uint8_t brightness);
  void clear();
  void show();
  uint8_t getNumLeds() { return numLeds; }
};

#endif

