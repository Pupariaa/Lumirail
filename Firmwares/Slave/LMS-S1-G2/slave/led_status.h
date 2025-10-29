#ifndef LED_STATUS_H
#define LED_STATUS_H

#include "ws2812b.h"
#include <stdint.h>

enum LedState {
  LED_STATE_INIT = 0,
  LED_STATE_IO_ERROR,
  LED_STATE_COMM_ERROR,
  LED_STATE_WAITING_PAIR,
  LED_STATE_PAIRED,
  LED_STATE_COMMAND_RECEIVED,
  LED_STATE_UNPAIRED,
  LED_STATE_RESETTING,
  LED_STATE_POWER_LOW,
  LED_STATE_SHORT_CIRCUIT,
  LED_STATE_OVERCURRENT
};

class LedStatus {
private:
  WS2812B* led;
  LedState currentState;
  LedState lastState;
  uint32_t lastUpdate;
  uint32_t animationCounter;
  bool blinkState;

  void updateInit();
  void updateIoError();
  void updateCommError();
  void updateWaitingPair();
  void updatePaired();
  void updateCommandReceived();
  void updateUnpaired();
  void updateResetting();
  void updatePowerLow();
  void updateShortCircuit();
  void updateOvercurrent();

public:
  LedStatus(WS2812B* led);
  void begin();
  void update();
  void setState(LedState state);
  LedState getState() { return currentState; }
};

#endif

