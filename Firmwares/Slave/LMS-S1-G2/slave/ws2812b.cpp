#include "ws2812b.h"

WS2812B::WS2812B(uint8_t pin, uint8_t numLeds) : numLeds(numLeds) {
  strip = new Adafruit_NeoPixel(numLeds, pin, NEO_GRB + NEO_KHZ800);
}

WS2812B::~WS2812B() {
  delete strip;
}

bool WS2812B::begin() {
  strip->begin();
  strip->clear();
  strip->show();
  return true;
}

void WS2812B::setPixel(uint8_t index, uint8_t r, uint8_t g, uint8_t b) {
  if (index >= numLeds) return;
  strip->setPixelColor(index, strip->Color(r, g, b));
}

void WS2812B::setPixel(uint8_t index, uint32_t color) {
  if (index >= numLeds) return;
  strip->setPixelColor(index, color);
}

void WS2812B::setPixelDimmed(uint8_t index, uint8_t r, uint8_t g, uint8_t b, uint8_t brightness) {
  if (index >= numLeds || brightness > 100) return;
  r = (r * brightness) / 100;
  g = (g * brightness) / 100;
  b = (b * brightness) / 100;
  strip->setPixelColor(index, strip->Color(r, g, b));
}

void WS2812B::clear() {
  strip->clear();
}

void WS2812B::show() {
  strip->show();
}
