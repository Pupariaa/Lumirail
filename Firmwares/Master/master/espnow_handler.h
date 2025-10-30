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
  bool sendPairRequest(const uint8_t* mac);
  bool sendUnpair(const uint8_t* mac);
  bool sendCommand(const uint8_t* mac, const char* command);
  bool sendBroadcastCommand(const char* command);
  bool sendFwBegin(const uint8_t* mac, uint16_t sessionId, const char version[8], uint32_t sizeBytes, uint32_t crc32);
  bool sendFwChunk(const uint8_t* mac, uint16_t sessionId, uint32_t offset, const uint8_t* data, uint16_t len, uint32_t chunkCrc32);
  bool sendFwEnd(const uint8_t* mac, uint16_t sessionId);
  bool isFwActive() const { return fwActive; }
  void setFwActive(bool v) { fwActive = v; }
  
  uint16_t getSequenceCounter() { return sequenceCounter; }
  
private:
  uint16_t sequenceCounter;
  uint64_t lastBroadcast;
  bool broadcastPeerAdded;
  
  void sendBroadcastDiscovery();
  static void onDataSent(const esp_now_send_info_t *info, esp_now_send_status_t status);
  static void onDataReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len);
  bool fwActive;
};

extern EspNowHandler espnowHandler;

#endif

