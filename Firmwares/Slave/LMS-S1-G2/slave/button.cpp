#include "button.h"
#include <Arduino.h>

Button::Button(uint8_t pin, uint32_t holdTime) 
  : pin(pin), lastState(HIGH), currentState(HIGH), 
    lastDebounceTime(0), pressStartTime(0), holdTime(holdTime),
    pressed(false), held(false), released(false) {
}

void Button::begin() {
  pinMode(pin, INPUT_PULLDOWN);
  lastState = digitalRead(pin);
  currentState = lastState;
}

void Button::update() {
  pressed = false;
  held = false;
  released = false;
  
  bool reading = digitalRead(pin);
  
  if (reading != lastState) {
    lastDebounceTime = millis();
  }
  
  if ((millis() - lastDebounceTime) > BUTTON_DEBOUNCE_MS) {
    if (reading != currentState) {
      currentState = reading;
      
      if (currentState == HIGH) {
        pressed = true;
        pressStartTime = millis();
      } else {
        released = true;
        pressStartTime = 0;
      }
    }
  }
  
  if (currentState == HIGH && pressStartTime > 0) {
    if ((millis() - pressStartTime) >= holdTime) {
      held = true;
    }
  }
  
  lastState = reading;
}

ButtonState Button::getState() {
  if (held) return BUTTON_HELD;
  if (pressed) return BUTTON_PRESSED;
  if (released) return BUTTON_RELEASED;
  return BUTTON_IDLE;
}

void Button::reset() {
  pressed = false;
  held = false;
  released = false;
  pressStartTime = 0;
}

