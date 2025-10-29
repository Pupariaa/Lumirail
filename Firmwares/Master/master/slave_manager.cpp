#include "slave_manager.h"
#include "espnow_handler.h"
#include <esp_wifi.h>

SlaveManager slaveManager;

SlaveManager::SlaveManager() {
  memset(&stats, 0, sizeof(CurrentStats));
  lastScan = 0;
  for (int i = 0; i < MAX_SLAVES; i++) {
    memset(&slaves[i], 0, sizeof(SlaveInfo));
    slaves[i].state = STATE_UNPAIRED;
    slaves[i].linked = 0;
  }
}

void SlaveManager::init() {
  for (int i = 0; i < MAX_SLAVES; i++) {
    memset(&slaves[i], 0, sizeof(SlaveInfo));
    slaves[i].state = STATE_UNPAIRED;
    slaves[i].linked = 0;
  }
}

void SlaveManager::update() {
  checkSlaveTimeouts();
  
  // Periodic scan every 5 seconds
  uint64_t now = millis();
  if (now - lastScan >= 5000) {
    scanSlaves();
    lastScan = now;
  }
}

void SlaveManager::handleSlaveStatus(const uint8_t* mac, EspNowMessage* msg) {
  int index = findSlaveByMAC(mac);
  bool isNewSlave = false;
  
  if (index < 0) {
    index = findFreeSlaveSlot();
    if (index < 0) {
      Serial.println("WARNING: No free slots for new slave");
      return;
    }
    isNewSlave = true;
  }
  
  if (isNewSlave || slaves[index].state == STATE_LOST || slaves[index].state == STATE_UNPAIRED) {
    Serial.print("RESET SLOT ");
    Serial.print(index);
    Serial.print(" - Before: linked=");
    Serial.print(slaves[index].linked);
    Serial.print(" state=");
    Serial.println(slaves[index].state);
    
    memset(&slaves[index], 0, sizeof(SlaveInfo));
    
    Serial.print("RESET SLOT ");
    Serial.print(index);
    Serial.print(" - After memset: linked=");
    Serial.print(slaves[index].linked);
    Serial.print(" state=");
    Serial.println(slaves[index].state);
    
    memcpy(slaves[index].mac, mac, 6);
    slaves[index].state = STATE_UNPAIRED;
    slaves[index].linked = 0;
    
    Serial.print("RESET SLOT ");
    Serial.print(index);
    Serial.print(" - After init: linked=");
    Serial.print(slaves[index].linked);
    Serial.print(" state=");
    Serial.println(slaves[index].state);
  }
  
  slaves[index].lastSeen = millis();
  slaves[index].rssi = msg->payload[0] | (msg->payload[1] << 8);
  
  if (slaves[index].state == STATE_UNPAIRED) {
    slaves[index].state = STATE_DISCOVERED;
    slaves[index].linked = 0;
    stats.discoveredCount++;
    
    char name[32] = "Slave-";
    for (int i = 0; i < 6; i++) {
      char hex[3];
      sprintf(hex, "%02X", slaves[index].mac[i]);
      strcat(name, hex);
    }
    memcpy(slaves[index].name, name, strlen(name));
    
    Serial.print("DISCOVERED: ID ");
    Serial.print(index);
    Serial.print(" MAC ");
    for (int i = 0; i < 6; i++) {
      Serial.printf("%02X", slaves[index].mac[i]);
      if (i < 5) Serial.print(":");
    }
    Serial.print(" RSSI ");
    Serial.print(slaves[index].rssi);
    Serial.print(" Linked=");
    Serial.print(slaves[index].linked);
    Serial.println(" (use 'pair " + String(index) + "' to pair)");
  }
}

void SlaveManager::handlePingResponse(const uint8_t* mac, EspNowMessage* msg) {
  Serial.print("PONG: ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.println();
}

void SlaveManager::handleAck(const uint8_t* mac, EspNowMessage* msg) {
  Serial.println("ACK received");
}

void SlaveManager::handleNack(const uint8_t* mac, EspNowMessage* msg) {
  Serial.println("NACK received");
}

void SlaveManager::handlePairResponse(const uint8_t* mac, EspNowMessage* msg) {
  int slaveId = findSlaveByMAC(mac);
  if (slaveId < 0) {
    Serial.println("WARNING: Pair response from unknown slave");
    return;
  }
  
  if (msg->payloadLength < 1) {
    Serial.println("ERROR: Invalid pair response (no payload)");
    return;
  }
  
  bool accepted = (msg->payload[0] == 1);
  
  if (accepted) {
    if (!slaves[slaveId].linked) {
      slaves[slaveId].linked = 1;
      slaves[slaveId].state = STATE_PAIRED;
      stats.pairedCount++;
      
      Serial.print("PAIRED: ID ");
      Serial.print(slaveId);
      Serial.print(" MAC ");
      for (int i = 0; i < 6; i++) {
        Serial.printf("%02X", slaves[slaveId].mac[i]);
        if (i < 5) Serial.print(":");
      }
      Serial.println();
    }
  } else {
    Serial.print("PAIR REJECTED by slave ID ");
    Serial.print(slaveId);
    Serial.print(" MAC ");
    for (int i = 0; i < 6; i++) {
      Serial.printf("%02X", slaves[slaveId].mac[i]);
      if (i < 5) Serial.print(":");
    }
    Serial.println();
  }
}

void SlaveManager::checkSlaveTimeouts() {
  uint64_t now = millis();
  
  for (int i = 0; i < MAX_SLAVES; i++) {
    if (slaves[i].state != STATE_UNPAIRED) {
      if (now - slaves[i].lastSeen > DISCOVERY_TIMEOUT) {
        Serial.print("LOST: ID ");
        Serial.print(i);
        Serial.print(" MAC ");
        for (int j = 0; j < 6; j++) {
          Serial.printf("%02X", slaves[i].mac[j]);
          if (j < 5) Serial.print(":");
        }
        Serial.println();
        
        if (slaves[i].linked) {
          stats.pairedCount--;
        }
        stats.discoveredCount--;
        
        memset(&slaves[i], 0, sizeof(SlaveInfo));
        slaves[i].state = STATE_UNPAIRED;
      }
    }
  }
}

void SlaveManager::pairSlave(int slaveId) {
  if (slaveId < 0 || slaveId >= MAX_SLAVES) {
    Serial.println("ERROR: Invalid slave ID");
    return;
  }
  
  Serial.print("DEBUG: SlaveID=");
  Serial.print(slaveId);
  Serial.print(" State=");
  Serial.print(slaves[slaveId].state);
  Serial.print(" Linked=");
  Serial.print(slaves[slaveId].linked);
  
  Serial.print(" MAC=");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", slaves[slaveId].mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.println();
  
  if (slaves[slaveId].state == STATE_UNPAIRED || slaves[slaveId].state == STATE_LOST) {
    Serial.println("ERROR: Slave not discovered");
    return;
  }
  
  if (slaves[slaveId].linked) {
    Serial.println("ERROR: Slave already paired");
    return;
  }
  
  Serial.print("Sending pair request to slave ID ");
  Serial.print(slaveId);
  Serial.print(" MAC ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", slaves[slaveId].mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.println();
  
  if (!espnowHandler.sendPairRequest(slaves[slaveId].mac)) {
    Serial.println("ERROR: Failed to send pair request");
    return;
  }
}

void SlaveManager::unpairSlave(int slaveId) {
  if (slaveId < 0 || slaveId >= MAX_SLAVES) {
    Serial.println("ERROR: Invalid slave ID");
    return;
  }
  
  if (slaves[slaveId].linked) {
    slaves[slaveId].linked = 0;
    slaves[slaveId].state = STATE_DISCOVERED;
    stats.pairedCount--;
    
    Serial.print("UNPAIRED: ID ");
    Serial.print(slaveId);
    Serial.print(" MAC ");
    for (int i = 0; i < 6; i++) {
      Serial.printf("%02X", slaves[slaveId].mac[i]);
      if (i < 5) Serial.print(":");
    }
    Serial.println();
  } else {
    Serial.println("ERROR: Slave not paired");
  }
}

bool SlaveManager::sendPing(int slaveId) {
  if (slaveId < 0 || slaveId >= MAX_SLAVES || !slaves[slaveId].linked) {
    Serial.println("ERROR: Invalid slave ID or not paired");
    return false;
  }
  
  return espnowHandler.sendPing(slaves[slaveId].mac);
}

bool SlaveManager::sendCommand(int slaveId, const char* command) {
  if (slaveId < 0 || slaveId >= MAX_SLAVES || !slaves[slaveId].linked) {
    Serial.println("ERROR: Invalid slave ID or not paired");
    return false;
  }
  
  return espnowHandler.sendCommand(slaves[slaveId].mac, command);
}

void SlaveManager::printAllSlaves() {
  Serial.println("=== ALL SLAVES ===");
  Serial.println("Format: ID [MAC] [RSSI] [State]");
  
  bool found = false;
  for (int i = 0; i < MAX_SLAVES; i++) {
    if (slaves[i].state != STATE_UNPAIRED) {
      found = true;
      Serial.print("ID ");
      Serial.print(i);
      Serial.print(": ");
      for (int j = 0; j < 6; j++) {
        Serial.printf("%02X", slaves[i].mac[j]);
        if (j < 5) Serial.print(":");
      }
      Serial.print(" RSSI ");
      Serial.print(slaves[i].rssi);
      Serial.print(" ");
      
      if (slaves[i].linked) {
        Serial.print("PAIRED");
      } else if (slaves[i].state == STATE_DISCOVERED) {
        Serial.print("UNPAIRED");
      } else if (slaves[i].state == STATE_LOST) {
        Serial.print("LOST");
      }
      Serial.println();
    }
  }
  
  if (!found) {
    Serial.println("No slaves discovered");
  }
}

void SlaveManager::printPairedSlaves() {
  Serial.println("=== PAIRED SLAVES ===");
  bool found = false;
  
  for (int i = 0; i < MAX_SLAVES; i++) {
    if (slaves[i].state == STATE_PAIRED && slaves[i].linked) {
      found = true;
      Serial.print("ID ");
      Serial.print(i);
      Serial.print(": ");
      for (int j = 0; j < 6; j++) {
        Serial.printf("%02X", slaves[i].mac[j]);
        if (j < 5) Serial.print(":");
      }
      Serial.print(" RSSI ");
      Serial.print(slaves[i].rssi);
      Serial.print(" Last ");
      Serial.print((millis() - slaves[i].lastSeen) / 1000);
      Serial.println("s ago");
    }
  }
  
  if (!found) {
    Serial.println("No slaves paired");
  }
}

void SlaveManager::printStats() {
  Serial.print("STATS: Paired=");
  Serial.print(stats.pairedCount);
  Serial.print(" Discovered=");
  Serial.print(stats.discoveredCount);
  Serial.print(" Sent=");
  Serial.print(stats.messagesSent);
  Serial.print(" Recv=");
  Serial.print(stats.messagesReceived);
  Serial.print(" Lost=");
  Serial.println(stats.messagesLost);
}

void SlaveManager::scanSlaves() {
  Serial.println("\n=== SLAVE SCAN ===");
  
  uint8_t discoveredCount = 0;
  uint8_t pairedCount = 0;
  
  // Count and display discovered slaves
  Serial.println("Available (unpaired):");
  for (int i = 0; i < MAX_SLAVES; i++) {
    if (slaves[i].state == STATE_DISCOVERED && !slaves[i].linked) {
      discoveredCount++;
      Serial.print("  ID ");
      Serial.print(i);
      Serial.print(": MAC ");
      for (int j = 0; j < 6; j++) {
        Serial.printf("%02X", slaves[i].mac[j]);
        if (j < 5) Serial.print(":");
      }
      Serial.print(" RSSI ");
      Serial.print(slaves[i].rssi);
      Serial.print(" Last seen ");
      Serial.print((millis() - slaves[i].lastSeen) / 1000);
      Serial.println("s ago");
    }
  }
  
  if (discoveredCount == 0) {
    Serial.println("  None");
  }
  
  // Count and display paired slaves (and ping them)
  Serial.println("Paired:");
  for (int i = 0; i < MAX_SLAVES; i++) {
    if (slaves[i].state == STATE_PAIRED && slaves[i].linked) {
      pairedCount++;
      Serial.print("  ID ");
      Serial.print(i);
      Serial.print(": MAC ");
      for (int j = 0; j < 6; j++) {
        Serial.printf("%02X", slaves[i].mac[j]);
        if (j < 5) Serial.print(":");
      }
      Serial.print(" RSSI ");
      Serial.print(slaves[i].rssi);
      Serial.print(" Last seen ");
      Serial.print((millis() - slaves[i].lastSeen) / 1000);
      Serial.print("s ago");
      
      // Ping paired slaves to verify they're still responsive
      Serial.print(" [PING...");
      espnowHandler.sendPing(slaves[i].mac);
      Serial.print("]");
      
      Serial.println();
    }
  }
  
  if (pairedCount == 0) {
    Serial.println("  None");
  }
  
  Serial.print("Summary: ");
  Serial.print(discoveredCount);
  Serial.print(" available, ");
  Serial.print(pairedCount);
  Serial.println(" paired");
  Serial.println("=== END SCAN ===\n");
}

int SlaveManager::findSlaveByMAC(const uint8_t* mac) {
  for (int i = 0; i < MAX_SLAVES; i++) {
    if (slaves[i].state != STATE_UNPAIRED && memcmp(slaves[i].mac, mac, 6) == 0) {
      return i;
    }
  }
  return -1;
}

int SlaveManager::findFreeSlaveSlot() {
  for (int i = 0; i < MAX_SLAVES; i++) {
    if (slaves[i].state == STATE_UNPAIRED || slaves[i].state == STATE_LOST) {
      return i;
    }
  }
  return -1;
}

