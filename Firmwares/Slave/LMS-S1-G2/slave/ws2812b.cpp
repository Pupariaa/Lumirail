#include "ws2812b.h"
#include <Arduino.h>
#include "soc/gpio_struct.h"

WS2812B::WS2812B(uint8_t pin, uint8_t numLeds) : pin(pin), numLeds(numLeds), initialized(false) {
  buffer = new uint8_t[numLeds * 3];
  for (uint8_t i = 0; i < numLeds * 3; i++) {
    buffer[i] = 0;
  }
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
  uint32_t mask = 1UL << pin;
  volatile uint32_t t0, t1, t2;
  
  if (bit) {
    GPIO.out_w1ts = mask;
    t0 = 0; t1 = 0; t2 = 0;
    for (volatile uint8_t i = 0; i < 28; i++) {
      __asm__ __volatile__("nop");
    }
    GPIO.out_w1tc = mask;
    t0 = 0; t1 = 0; t2 = 0;
    for (volatile uint8_t i = 0; i < 10; i++) {
      __asm__ __volatile__("nop");
    }
  } else {
    GPIO.out_w1ts = mask;
    t0 = 0; t1 = 0; t2 = 0;
    for (volatile uint8_t i = 0; i < 10; i++) {
      __asm__ __volatile__("nop");
    }
    GPIO.out_w1tc = mask;
    t0 = 0; t1 = 0; t2 = 0;
    for (volatile uint8_t i = 0; i < 28; i++) {
      __asm__ __volatile__("nop");
    }
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
  
  static uint32_t lastDebug = 0;
  uint32_t now = millis();
  if (index == 0 && now - lastDebug > 500) {
    Serial.print("setPixel[0] called - R:");
    Serial.print(r);
    Serial.print(" G:");
    Serial.print(g);
    Serial.print(" B:");
    Serial.print(b);
    Serial.print(" -> Buffer[");
    Serial.print(pos);
    Serial.print("]=G:");
    Serial.print(buffer[pos]);
    Serial.print(" Buffer[");
    Serial.print(pos+1);
    Serial.print("]=R:");
    Serial.print(buffer[pos+1]);
    Serial.print(" Buffer[");
    Serial.print(pos+2);
    Serial.print("]=B:");
    Serial.println(buffer[pos+2]);
    lastDebug = now;
  }
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
  portDISABLE_INTERRUPTS();
  
  uint32_t mask = 1UL << pin;
  
  for (uint8_t i = 0; i < numLeds * 3; i++) {
    uint8_t byte = buffer[i];
    for (int8_t bit = 7; bit >= 0; bit--) {
      if (byte & (1 << bit)) {
        GPIO.out_w1ts = mask;
        __asm__ __volatile__("nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop;");
        GPIO.out_w1tc = mask;
        __asm__ __volatile__("nop; nop; nop; nop; nop; nop; nop; nop; nop; nop;");
      } else {
        GPIO.out_w1ts = mask;
        __asm__ __volatile__("nop; nop; nop; nop; nop; nop; nop; nop; nop; nop;");
        GPIO.out_w1tc = mask;
        __asm__ __volatile__("nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop; nop;");
      }
    }
  }
  
  portENABLE_INTERRUPTS();
  delayMicroseconds(80);
}

