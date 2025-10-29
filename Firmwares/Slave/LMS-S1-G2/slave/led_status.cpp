#include "led_status.h"
#include <Arduino.h>

#define ANIMATION_UPDATE_MS 30
#define LED_BRIGHTNESS 50

LedStatus::LedStatus(WS2812B* led) : led(led), currentState(LED_STATE_INIT), lastState(LED_STATE_INIT), 
                                      lastUpdate(0), animationCounter(0), blinkState(false) {
}

void LedStatus::begin() {
  currentState = LED_STATE_INIT;
  lastState = LED_STATE_INIT;
  animationCounter = 0;
  blinkState = false;
  lastUpdate = millis();
}

const char* getStateName(LedState state) {
  switch(state) {
    case LED_STATE_INIT: return "INIT";
    case LED_STATE_IO_ERROR: return "IO_ERROR";
    case LED_STATE_COMM_ERROR: return "COMM_ERROR";
    case LED_STATE_WAITING_PAIR: return "WAITING_PAIR";
    case LED_STATE_PAIRED: return "PAIRED";
    case LED_STATE_COMMAND_RECEIVED: return "COMMAND_RECEIVED";
    case LED_STATE_UNPAIRED: return "UNPAIRED";
    case LED_STATE_RESETTING: return "RESETTING";
    case LED_STATE_POWER_LOW: return "POWER_LOW";
    case LED_STATE_SHORT_CIRCUIT: return "SHORT_CIRCUIT";
    case LED_STATE_OVERCURRENT: return "OVERCURRENT";
    case LED_STATE_TEMP_OVERHEAT_POWER: return "TEMP_OVERHEAT_POWER";
    case LED_STATE_TEMP_OVERHEAT_LED1: return "TEMP_OVERHEAT_LED1";
    case LED_STATE_TEMP_OVERHEAT_LED2: return "TEMP_OVERHEAT_LED2";
    default: return "UNKNOWN";
  }
}

void LedStatus::setState(LedState state) {
  if (state != currentState) {
    Serial.print("LED State change: ");
    Serial.print(getStateName(currentState));
    Serial.print(" -> ");
    Serial.println(getStateName(state));
    lastState = currentState;
    currentState = state;
    animationCounter = 0;
    blinkState = false;
  }
}

void LedStatus::update() {
  uint32_t now = millis();
  if (now - lastUpdate < ANIMATION_UPDATE_MS) {
    return;
  }
  lastUpdate = now;
  animationCounter++;

  switch (currentState) {
    case LED_STATE_INIT:
      updateInit();
      break;
    case LED_STATE_IO_ERROR:
      updateIoError();
      break;
    case LED_STATE_COMM_ERROR:
      updateCommError();
      break;
    case LED_STATE_WAITING_PAIR:
      updateWaitingPair();
      break;
    case LED_STATE_PAIRED:
      updatePaired();
      break;
    case LED_STATE_COMMAND_RECEIVED:
      updateCommandReceived();
      break;
    case LED_STATE_UNPAIRED:
      updateUnpaired();
      break;
    case LED_STATE_RESETTING:
      updateResetting();
      break;
    case LED_STATE_POWER_LOW:
      updatePowerLow();
      break;
    case LED_STATE_SHORT_CIRCUIT:
      updateShortCircuit();
      break;
    case LED_STATE_OVERCURRENT:
      updateOvercurrent();
      break;
    case LED_STATE_TEMP_OVERHEAT_POWER:
      updateTempOverheatPower();
      break;
    case LED_STATE_TEMP_OVERHEAT_LED1:
      updateTempOverheatLed1();
      break;
    case LED_STATE_TEMP_OVERHEAT_LED2:
      updateTempOverheatLed2();
      break;
  }
  
  led->show();
}

void LedStatus::updateInit() {
  uint8_t cycle = animationCounter % 100;
  
  if (cycle < 50) {
    uint8_t intensity = (cycle * 255) / 50;
    uint8_t dimmed = (intensity * LED_BRIGHTNESS) / 100;
    led->setPixel(0, 0, dimmed, dimmed);
  } else {
    uint8_t intensity = ((100 - cycle) * 255) / 50;
    uint8_t dimmed = (intensity * LED_BRIGHTNESS) / 100;
    led->setPixel(0, 0, dimmed, dimmed);
  }
}

void LedStatus::updateIoError() {
  uint8_t cycle = animationCounter % 20;
  if (cycle < 10) {
    led->setPixelDimmed(0, 255, 0, 0, LED_BRIGHTNESS);
  } else {
    led->setPixel(0, 0, 0, 0);
  }
}

void LedStatus::updateCommError() {
  uint8_t cycle = animationCounter % 60;
  
  if (cycle < 30) {
    uint8_t intensity = (cycle * 255) / 30;
    led->setPixelDimmed(0, 255, intensity * 3 / 4, 0, LED_BRIGHTNESS);
  } else {
    uint8_t intensity = ((60 - cycle) * 255) / 30;
    led->setPixelDimmed(0, 255, intensity * 3 / 4, 0, LED_BRIGHTNESS);
  }
}

void LedStatus::updateWaitingPair() {
  uint8_t cycle = animationCounter % 80;
  
  if (cycle < 40) {
    uint8_t intensity = (cycle * 255) / 40;
    led->setPixelDimmed(0, 0, 0, intensity, LED_BRIGHTNESS);
  } else {
    uint8_t intensity = ((80 - cycle) * 255) / 40;
    led->setPixelDimmed(0, 0, 0, intensity, LED_BRIGHTNESS);
  }
}

void LedStatus::updatePaired() {
  uint8_t cycle = animationCounter % 120;
  
  if (cycle < 60) {
    uint8_t intensity = 80 + (cycle * 175) / 60;
    led->setPixelDimmed(0, 0, intensity, 0, LED_BRIGHTNESS);
  } else {
    uint8_t intensity = 255 - ((cycle - 60) * 175) / 60;
    led->setPixelDimmed(0, 0, intensity, 0, LED_BRIGHTNESS);
  }
}

void LedStatus::updateCommandReceived() {
  uint8_t cycle = animationCounter % 15;
  
  if (cycle < 5) {
    led->setPixelDimmed(0, 255, 255, 255, LED_BRIGHTNESS);
  } else {
    led->setPixel(0, 0, 0, 0);
    if (cycle == 14) {
      setState(lastState);
    }
  }
}

void LedStatus::updateUnpaired() {
  uint8_t cycle = animationCounter % 60;
  
  if (cycle < 30) {
    uint8_t intensity = (cycle * 255) / 30;
    led->setPixelDimmed(0, 255, intensity, 0, LED_BRIGHTNESS);
  } else {
    uint8_t intensity = ((60 - cycle) * 255) / 30;
    led->setPixelDimmed(0, 255, intensity, 0, LED_BRIGHTNESS);
  }
}

void LedStatus::updateResetting() {
  uint8_t cycle = animationCounter % 40;
  uint8_t hue = (cycle * 9) % 360;
  
  if (hue < 60) {
    led->setPixelDimmed(0, 255, (hue * 255) / 60, 0, LED_BRIGHTNESS);
  } else if (hue < 120) {
    led->setPixelDimmed(0, 255 - ((hue - 60) * 255) / 60, 255, 0, LED_BRIGHTNESS);
  } else if (hue < 180) {
    led->setPixelDimmed(0, 0, 255, ((hue - 120) * 255) / 60, LED_BRIGHTNESS);
  } else if (hue < 240) {
    led->setPixelDimmed(0, 0, 255 - ((hue - 180) * 255) / 60, 255, LED_BRIGHTNESS);
  } else if (hue < 300) {
    led->setPixelDimmed(0, ((hue - 240) * 255) / 60, 0, 255, LED_BRIGHTNESS);
  } else {
    led->setPixelDimmed(0, 255, 0, 255 - ((hue - 300) * 255) / 60, LED_BRIGHTNESS);
  }
}

void LedStatus::updatePowerLow() {
  uint8_t cycle = animationCounter % 40;
  
  if (cycle < 20) {
    uint8_t intensity = (cycle * 255) / 20;
    led->setPixelDimmed(0, intensity, intensity / 4, 0, LED_BRIGHTNESS);
  } else {
    uint8_t intensity = ((40 - cycle) * 255) / 20;
    led->setPixelDimmed(0, intensity, intensity / 4, 0, LED_BRIGHTNESS);
  }
}

void LedStatus::updateShortCircuit() {
  blinkState = (animationCounter / 2) % 2;
  if (blinkState) {
    led->setPixelDimmed(0, 255, 0, 0, LED_BRIGHTNESS);
  } else {
    led->setPixel(0, 0, 0, 0);
  }
}

void LedStatus::updateOvercurrent() {
  uint8_t cycle = animationCounter % 30;
  
  if (cycle < 15) {
    uint8_t intensity = (cycle * 255) / 15;
    led->setPixelDimmed(0, 255, intensity * 3 / 4, 0, LED_BRIGHTNESS);
  } else {
    uint8_t intensity = ((30 - cycle) * 255) / 15;
    led->setPixelDimmed(0, 255, intensity * 3 / 4, 0, LED_BRIGHTNESS);
  }
}

void LedStatus::updateTempOverheatPower() {
  uint8_t cycle = animationCounter % 30;
  
  if (cycle < 15) {
    uint8_t intensity = (cycle * 255) / 15;
    led->setPixelDimmed(0, intensity, 0, 0, LED_BRIGHTNESS);
  } else {
    uint8_t intensity = ((30 - cycle) * 255) / 15;
    led->setPixelDimmed(0, intensity, 0, 0, LED_BRIGHTNESS);
  }
}

void LedStatus::updateTempOverheatLed1() {
  uint8_t cycle = animationCounter % 30;
  
  if (cycle < 15) {
    uint8_t intensity = (cycle * 255) / 15;
    led->setPixelDimmed(0, intensity, intensity * 2 / 5, 0, LED_BRIGHTNESS);
  } else {
    uint8_t intensity = ((30 - cycle) * 255) / 15;
    led->setPixelDimmed(0, intensity, intensity * 2 / 5, 0, LED_BRIGHTNESS);
  }
}

void LedStatus::updateTempOverheatLed2() {
  uint8_t cycle = animationCounter % 30;
  
  if (cycle < 15) {
    uint8_t intensity = (cycle * 255) / 15;
    uint8_t r = intensity * 3 / 5;
    uint8_t b = intensity;
    led->setPixelDimmed(0, r, 0, b, LED_BRIGHTNESS);
  } else {
    uint8_t intensity = ((30 - cycle) * 255) / 15;
    uint8_t r = intensity * 3 / 5;
    uint8_t b = intensity;
    led->setPixelDimmed(0, r, 0, b, LED_BRIGHTNESS);
  }
}

