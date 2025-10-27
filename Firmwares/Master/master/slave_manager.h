#ifndef SLAVE_MANAGER_H
#define SLAVE_MANAGER_H

#include "protocol.h"

class SlaveManager {
public:
  SlaveManager();
  void init();
  void update();
  
  void handleSlaveStatus(const uint8_t* mac, EspNowMessage* msg);
  void handlePingResponse(const uint8_t* mac, EspNowMessage* msg);
  void handleAck(const uint8_t* mac, EspNowMessage* msg);
  void handleNack(const uint8_t* mac, EspNowMessage* msg);
  
  void pairSlave(int slaveId);
  void unpairSlave(int slaveId);
  bool sendPing(int slaveId);
  bool sendCommand(int slaveId, const char* command);
  
  void printAllSlaves();
  void printPairedSlaves();
  void printStats();
  
  SlaveInfo* getSlaves() { return slaves; }
  CurrentStats* getStats() { return &stats; }
  
private:
  SlaveInfo slaves[MAX_SLAVES];
  CurrentStats stats;
  
  void checkSlaveTimeouts();
  int findSlaveByMAC(const uint8_t* mac);
  int findFreeSlaveSlot();
};

extern SlaveManager slaveManager;

#endif

