#ifndef ESPNOW_HANDLER_H
#define ESPNOW_HANDLER_H

#include "protocol.h"
#include <esp_now.h>

class EspNowHandler {
public:
  EspNowHandler();
  void init();
  void update();
  
  bool sendPing(const uint8_t* mac);
  bool sendCommand(const uint8_t* mac, const char* command);
  bool sendBroadcastCommand(const char* command);
  
  uint16_t getSequenceCounter() { return sequenceCounter; }
  
private:
  uint16_t sequenceCounter;
  uint64_t lastBroadcast;
  bool broadcastPeerAdded;
  
  void sendBroadcastDiscovery();
  static void onDataSent(const esp_now_send_info_t *info, esp_now_send_status_t status);
  static void onDataReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len);
};

extern EspNowHandler espnowHandler;

#endif

