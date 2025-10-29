#ifndef BUTTON_H
#define BUTTON_H

#include <stdint.h>

#define BUTTON_PIN 5
#define BUTTON_DEBOUNCE_MS 50

enum ButtonState {
  BUTTON_IDLE = 0,
  BUTTON_PRESSED,
  BUTTON_HELD,
  BUTTON_RELEASED
};

class Button {
private:
  uint8_t pin;
  bool lastState;
  bool currentState;
  uint32_t lastDebounceTime;
  uint32_t pressStartTime;
  uint32_t holdTime;
  bool pressed;
  bool held;
  bool released;

public:
  Button(uint8_t pin = BUTTON_PIN, uint32_t holdTime = 1000);
  void begin();
  void update();
  bool isPressed() { return pressed; }
  bool isHeld() { return held; }
  bool isReleased() { return released; }
  ButtonState getState();
  void reset();
};

#endif

