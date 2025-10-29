#ifndef WS2812B_H
#define WS2812B_H

#include <Adafruit_NeoPixel.h>

#define WS2812B_PIN 4

class WS2812B {
private:
  Adafruit_NeoPixel* strip;
  uint8_t numLeds;

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
