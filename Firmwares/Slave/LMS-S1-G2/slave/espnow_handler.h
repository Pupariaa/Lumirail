#ifndef ESPNOW_HANDLER_H
#define ESPNOW_HANDLER_H

#include "protocol.h"
#include "eeprom_config.h"
#include <esp_now.h>
#include "w25q.h"
#include "fw_header.h"

class EspNowHandler {
public:
  EspNowHandler();
  void init();
  void init(EepromConfig* config);
  void update();
  
  SlaveState getCurrentState() { return currentState; }
  bool hasCommandReceived() { bool result = commandReceived; commandReceived = false; return result; }
  
private:
  SlaveState currentState;
  uint16_t lastSequence;
  uint64_t lastMasterContact;
  uint64_t lastStatusSent;
  uint64_t lastPairRequest;
  uint8_t retryCount;
  bool commandReceived;
  EepromConfig* eepromConfig;
  
  void sendStatus();
  void requestPairing();
  void sendPairResponse(const uint8_t* mac, bool accepted);
  void sendAck(const uint8_t* mac, uint16_t sequence);
  void sendNack(const uint8_t* mac, uint16_t sequence);
  void checkTimeout();
  void handleFwBegin(const uint8_t* mac, EspNowMessage* msg);
  void handleFwChunk(const uint8_t* mac, EspNowMessage* msg);
  void handleFwEnd(const uint8_t* mac, EspNowMessage* msg);
  
  void handleMasterDiscovery(const uint8_t* mac, EspNowMessage* msg);
  void handlePairRequest(const uint8_t* mac, EspNowMessage* msg);
  void handleUnpair(const uint8_t* mac, EspNowMessage* msg);
  void handlePingRequest(const uint8_t* mac, EspNowMessage* msg);
  void handleCommand(const uint8_t* mac, EspNowMessage* msg);
  
  static void onDataReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len);
  static void onDataSent(const esp_now_send_info_t *info, esp_now_send_status_t status);
  
  static EspNowHandler* instance;

  // Firmware session state
  uint16_t fwSessionId;
  uint32_t fwExpectedOffset;
  uint32_t fwTotalSize;
  uint32_t fwCrcExpected;
  uint32_t fwCrcAccum;
  char fwVersion[8];
  bool fwActive;
  uint64_t lastResendAckTime;
};

extern EspNowHandler espnowHandler;

#endif

