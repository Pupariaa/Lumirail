#ifndef ESPNOW_HANDLER_H
#define ESPNOW_HANDLER_H

#include "protocol.h"
#include <esp_now.h>

class EspNowHandler {
public:
  EspNowHandler();
  void init();
  void update();
  
  SlaveState getCurrentState() { return currentState; }
  
private:
  SlaveState currentState;
  uint16_t lastSequence;
  uint64_t lastMasterContact;
  uint64_t lastStatusSent;
  uint8_t retryCount;
  
  void sendStatus();
  void sendAck(const uint8_t* mac, uint16_t sequence);
  void checkTimeout();
  
  void handleMasterDiscovery(const uint8_t* mac, EspNowMessage* msg);
  void handlePingRequest(const uint8_t* mac, EspNowMessage* msg);
  void handleCommand(const uint8_t* mac, EspNowMessage* msg);
  
  static void onDataReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len);
  static void onDataSent(const esp_now_send_info_t *info, esp_now_send_status_t status);
  
  static EspNowHandler* instance;
};

extern EspNowHandler espnowHandler;

#endif

