#include "ws2812b.h"
#include <Arduino.h>

WS2812B::WS2812B(uint8_t pin, uint8_t numLeds) : pin(pin), numLeds(numLeds), initialized(false) {
  buffer = new uint8_t[numLeds * 3];
}

WS2812B::~WS2812B() {
  delete[] buffer;
}

bool WS2812B::begin() {
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  clear();
  show();
  initialized = true;
  return true;
}

void WS2812B::sendBit(bool bit) {
  if (bit) {
    digitalWrite(pin, HIGH);
    delayMicroseconds(0.8);
    digitalWrite(pin, LOW);
    delayMicroseconds(0.45);
  } else {
    digitalWrite(pin, HIGH);
    delayMicroseconds(0.4);
    digitalWrite(pin, LOW);
    delayMicroseconds(0.85);
  }
}

void WS2812B::sendByte(uint8_t byte) {
  for (int i = 7; i >= 0; i--) {
    sendBit((byte >> i) & 0x01);
  }
}

void WS2812B::setPixel(uint8_t index, uint8_t r, uint8_t g, uint8_t b) {
  if (index >= numLeds) return;
  
  uint8_t pos = index * 3;
  buffer[pos] = g;
  buffer[pos + 1] = r;
  buffer[pos + 2] = b;
}

void WS2812B::setPixel(uint8_t index, uint32_t color) {
  uint8_t r = (color >> 16) & 0xFF;
  uint8_t g = (color >> 8) & 0xFF;
  uint8_t b = color & 0xFF;
  setPixel(index, r, g, b);
}

void WS2812B::setPixelDimmed(uint8_t index, uint8_t r, uint8_t g, uint8_t b, uint8_t brightness) {
  if (brightness > 100) brightness = 100;
  r = (r * brightness) / 100;
  g = (g * brightness) / 100;
  b = (b * brightness) / 100;
  setPixel(index, r, g, b);
}

void WS2812B::clear() {
  for (uint8_t i = 0; i < numLeds * 3; i++) {
    buffer[i] = 0;
  }
}

void WS2812B::show() {
  noInterrupts();
  for (uint8_t i = 0; i < numLeds * 3; i++) {
    sendByte(buffer[i]);
  }
  interrupts();
  delayMicroseconds(50);
}

