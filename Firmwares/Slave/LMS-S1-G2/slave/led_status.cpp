#include "led_status.h"
#include <Arduino.h>

#define ANIMATION_UPDATE_MS 50

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

void LedStatus::setState(LedState state) {
  if (state != currentState) {
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
  uint8_t cycle = animationCounter % 60;
  
  if (cycle < 20) {
    uint8_t intensity = (cycle * 255) / 20;
    led->setPixel(0, 0, intensity, intensity);
  } else if (cycle < 40) {
    uint8_t intensity = ((40 - cycle) * 255) / 20;
    led->setPixel(0, 0, intensity, intensity);
  } else {
    led->setPixel(0, 0, 0, 0);
  }
}

void LedStatus::updateIoError() {
  blinkState = (animationCounter / 10) % 2;
  if (blinkState) {
    led->setPixel(0, 255, 0, 0);
  } else {
    led->setPixel(0, 0, 0, 0);
  }
}

void LedStatus::updateCommError() {
  uint8_t cycle = animationCounter % 40;
  
  if (cycle < 10) {
    uint8_t intensity = (cycle * 255) / 10;
    led->setPixel(0, 255, intensity * 3 / 4, 0);
  } else if (cycle < 20) {
    uint8_t intensity = ((20 - cycle) * 255) / 10;
    led->setPixel(0, 255, intensity * 3 / 4, 0);
  } else {
    led->setPixel(0, 0, 0, 0);
  }
}

void LedStatus::updateWaitingPair() {
  uint8_t cycle = animationCounter % 60;
  
  if (cycle < 30) {
    uint8_t intensity = (cycle * 255) / 30;
    led->setPixel(0, 0, 0, intensity);
  } else {
    uint8_t intensity = ((60 - cycle) * 255) / 30;
    led->setPixel(0, 0, 0, intensity);
  }
}

void LedStatus::updatePaired() {
  uint8_t cycle = animationCounter % 100;
  
  if (cycle < 50) {
    uint8_t intensity = 128 + (cycle * 127) / 50;
    led->setPixel(0, 0, intensity, 0);
  } else {
    uint8_t intensity = 255 - ((cycle - 50) * 127) / 50;
    led->setPixel(0, 0, intensity, 0);
  }
}

void LedStatus::updateCommandReceived() {
  uint8_t cycle = animationCounter % 20;
  
  if (cycle < 4) {
    led->setPixel(0, 255, 255, 255);
  } else {
    led->setPixel(0, 0, 0, 0);
    if (cycle == 19) {
      setState(lastState);
    }
  }
}

void LedStatus::updateUnpaired() {
  uint8_t cycle = animationCounter % 40;
  
  if (cycle < 15) {
    uint8_t intensity = (cycle * 255) / 15;
    led->setPixel(0, 255, intensity, 0);
  } else if (cycle < 30) {
    uint8_t intensity = ((30 - cycle) * 255) / 15;
    led->setPixel(0, 255, intensity, 0);
  } else {
    led->setPixel(0, 0, 0, 0);
  }
}

void LedStatus::updateResetting() {
  uint8_t cycle = animationCounter % 20;
  uint8_t hue = (cycle * 6) % 360;
  
  if (hue < 60) {
    led->setPixel(0, 255, (hue * 255) / 60, 0);
  } else if (hue < 120) {
    led->setPixel(0, 255 - ((hue - 60) * 255) / 60, 255, 0);
  } else if (hue < 180) {
    led->setPixel(0, 0, 255, ((hue - 120) * 255) / 60);
  } else if (hue < 240) {
    led->setPixel(0, 0, 255 - ((hue - 180) * 255) / 60, 255);
  } else if (hue < 300) {
    led->setPixel(0, ((hue - 240) * 255) / 60, 0, 255);
  } else {
    led->setPixel(0, 255, 0, 255 - ((hue - 300) * 255) / 60);
  }
}

void LedStatus::updatePowerLow() {
  uint8_t cycle = animationCounter % 40;
  
  if (cycle < 20) {
    uint8_t intensity = (cycle * 255) / 20;
    led->setPixel(0, intensity, intensity / 4, 0);
  } else {
    uint8_t intensity = ((40 - cycle) * 255) / 20;
    led->setPixel(0, intensity, intensity / 4, 0);
  }
}

void LedStatus::updateShortCircuit() {
  blinkState = (animationCounter / 2) % 2;
  if (blinkState) {
    led->setPixel(0, 255, 0, 0);
  } else {
    led->setPixel(0, 0, 0, 0);
  }
}

void LedStatus::updateOvercurrent() {
  uint8_t cycle = animationCounter % 30;
  
  if (cycle < 15) {
    uint8_t intensity = (cycle * 255) / 15;
    led->setPixel(0, 255, intensity * 3 / 4, 0);
  } else {
    uint8_t intensity = ((30 - cycle) * 255) / 15;
    led->setPixel(0, 255, intensity * 3 / 4, 0);
  }
}

void LedStatus::updateTempOverheatPower() {
  uint8_t cycle = animationCounter % 40;
  
  if (cycle < 20) {
    uint8_t intensity = (cycle * 255) / 20;
    led->setPixel(0, intensity, 0, 0);
  } else {
    uint8_t intensity = ((40 - cycle) * 255) / 20;
    led->setPixel(0, intensity, 0, 0);
  }
}

void LedStatus::updateTempOverheatLed1() {
  uint8_t cycle = animationCounter % 20;
  
  if (cycle < 10) {
    led->setPixel(0, 255, 100, 0);
  } else {
    led->setPixel(0, 200, 50, 0);
  }
}

void LedStatus::updateTempOverheatLed2() {
  uint8_t cycle = animationCounter % 20;
  
  if (cycle < 10) {
    led->setPixel(0, 150, 0, 255);
  } else {
    led->setPixel(0, 100, 0, 200);
  }
}

