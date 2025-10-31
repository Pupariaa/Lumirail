#include "serial_commands.h"
#include "slave_manager.h"
#include "espnow_handler.h"
#include "crc32.h"
#include <WiFi.h>

extern WiFiServer fwServer;

static uint32_t g_fw_offset = 0;
static uint16_t g_fw_session = 1;
static int g_fw_target = 0;

SerialCommands serialCommands;
static bool g_fwPushActive = false;

SerialCommands::SerialCommands() {}

void SerialCommands::init() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("LumiRail Master - Starting...");
}

void SerialCommands::process() {
  if (g_fwPushActive) return;
  if (!Serial.available()) return;
  
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  handleCommand(cmd);
}

void SerialCommands::handleCommand(const String& cmd) {
  if (g_fwPushActive) return;
  if (cmd.length() == 0) return;
  
  if (cmd.startsWith("list")) {
    slaveManager.printAllSlaves();
    
  } else if (cmd.startsWith("paired")) {
    slaveManager.printPairedSlaves();
    
  } else if (cmd.startsWith("pair ")) {
    int id = cmd.substring(5).toInt();
    slaveManager.pairSlave(id);
    
  } else if (cmd.startsWith("unpair ")) {
    int id = cmd.substring(7).toInt();
    slaveManager.unpairSlave(id);
    
  } else if (cmd.startsWith("ping ")) {
    int id = cmd.substring(5).toInt();
    slaveManager.sendPing(id);
    
  } else if (cmd.startsWith("send ")) {
    int spaceIdx = cmd.indexOf(' ', 5);
    if (spaceIdx > 0) {
      int id = cmd.substring(5, spaceIdx).toInt();
      String message = cmd.substring(spaceIdx + 1);
      slaveManager.sendCommand(id, message.c_str());
    }
    
  } else if (cmd.startsWith("broadcast ")) {
    String message = cmd.substring(10);
    espnowHandler.sendBroadcastCommand(message.c_str());
    
  } else if (cmd.startsWith("stats")) {
    slaveManager.printStats();
    
  } else if (cmd.startsWith("fwbegin ")) {
    int p1 = cmd.indexOf(' ', 8);
    int p2 = cmd.indexOf(' ', p1 + 1);
    int p3 = cmd.indexOf(' ', p2 + 1);
    int p4 = cmd.indexOf(' ', p3 + 1);
    if (p1 > 0 && p2 > 0 && p3 > 0) {
      int id = cmd.substring(8, p1).toInt();
      uint32_t sizeBytes = (uint32_t)cmd.substring(p1 + 1, p2).toInt();
      String ver = (p4 > 0) ? cmd.substring(p2 + 1, p3) : cmd.substring(p2 + 1);
      uint16_t sessionId = (uint16_t)cmd.substring(p3 + 1, (p4 > 0 ? p4 : cmd.length())).toInt();
      uint32_t crc = 0;
      if (p4 > 0) {
        String crcStr = cmd.substring(p4 + 1);
        if (crcStr.startsWith("0x") || crcStr.startsWith("0X")) crc = strtoul(crcStr.c_str(), NULL, 16);
        else crc = (uint32_t)crcStr.toInt();
      }
      if (ver.length() > 8) ver = ver.substring(0, 8);
      char version[8] = {0};
      memcpy(version, ver.c_str(), ver.length());
      if (id < 0 || id >= MAX_SLAVES || !slaveManager.getSlaves()[id].linked) { Serial.println("ERROR: Invalid slave id"); return; }
      g_fw_offset = 0; g_fw_session = sessionId; g_fw_target = id;
      espnowHandler.sendFwBegin(slaveManager.getSlaves()[id].mac, sessionId, version, sizeBytes, crc);
      Serial.println("FWBEGIN sent");
    }
  } else if (cmd.startsWith("fwchunk ")) {
    String hex = cmd.substring(8);
    hex.trim();
    static uint8_t buf[188];
    int len = 0;
    for (unsigned i = 0; i + 1 < hex.length() && len < 188; i += 2) {
      char a = hex.charAt(i), b = hex.charAt(i + 1);
      auto hv = [](char c)->int { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'A' && c <= 'F') return c - 'A' + 10; if (c >= 'a' && c <= 'f') return c - 'a' + 10; return 0; };
      buf[len++] = (uint8_t)((hv(a) << 4) | hv(b));
    }
    if (slaveManager.getSlaves()[g_fw_target].linked) {
      uint32_t ccrc = crc32_finalize(crc32_update(crc32_init(), buf, len));
      espnowHandler.sendFwChunk(slaveManager.getSlaves()[g_fw_target].mac, g_fw_session, g_fw_offset, buf, (uint16_t)len, ccrc);
      g_fw_offset += (uint32_t)len;
      Serial.print("FWCHUNK sent len="); Serial.println(len);
    }
  } else if (cmd.startsWith("fwend")) {
    if (slaveManager.getSlaves()[g_fw_target].linked) {
      espnowHandler.sendFwEnd(slaveManager.getSlaves()[g_fw_target].mac, g_fw_session);
      Serial.println("FWEND sent");
    }
  } else if (cmd.startsWith("fwpush ")) {
    if (g_fwPushActive) return;
    int p1 = cmd.indexOf(' ', 7);
    int p2 = cmd.indexOf(' ', p1 + 1);
    int p3 = cmd.indexOf(' ', p2 + 1);
    int p4 = cmd.indexOf(' ', p3 + 1);
    int p5 = cmd.indexOf(' ', p4 + 1);
    if (p1 > 0 && p2 > 0 && p3 > 0 && p4 > 0) {
      int id = cmd.substring(7, p1).toInt();
      uint32_t sizeBytes = (uint32_t)cmd.substring(p1 + 1, p2).toInt();
      String ver = cmd.substring(p2 + 1, p3);
      uint16_t sessionId = (uint16_t)cmd.substring(p3 + 1, p4).toInt();
      uint32_t crc = 0;
      if (p5 > 0) {
        String crcStr = cmd.substring(p4 + 1);
        if (crcStr.startsWith("0x") || crcStr.startsWith("0X")) crc = strtoul(crcStr.c_str(), NULL, 16);
        else crc = (uint32_t)crcStr.toInt();
      } else {
        String crcStr = cmd.substring(p4 + 1);
        if (crcStr.length()) {
          if (crcStr.startsWith("0x") || crcStr.startsWith("0X")) crc = strtoul(crcStr.c_str(), NULL, 16);
          else crc = (uint32_t)crcStr.toInt();
        }
      }
      if (ver.length() > 8) ver = ver.substring(0, 8);
      char version[8] = {0};
      memcpy(version, ver.c_str(), ver.length());
      if (id < 0 || id >= MAX_SLAVES || !slaveManager.getSlaves()[id].linked) { Serial.println("ERROR: Invalid slave id"); return; }
      g_fwPushActive = true;
      espnowHandler.setFwTargetMac(slaveManager.getSlaves()[id].mac);
      espnowHandler.setFwActive(true);
      espnowHandler.setLastFwAckOffset(0);
      if (!espnowHandler.addFwTargetPeer()) {
        Serial.println("ERROR: Failed to add FW target peer");
        espnowHandler.setFwActive(false);
        espnowHandler.setFwTargetMac(nullptr);
        g_fwPushActive = false;
        return;
      }
      Serial.println("FWPUSH active, sending FW_BEGIN...");
      Serial.println("Other slaves will be ignored during update");
      espnowHandler.sendFwBegin(slaveManager.getSlaves()[id].mac, sessionId, version, sizeBytes, crc);
      Serial.println("Waiting for Slave to process FW_BEGIN...");
      delay(4000); // Attendre que le Slave traite FW_BEGIN (effacement flash, header, etc.)
      Serial.println("FWPUSH READY - waiting for chunks");
      
      // Vider le buffer série avant de lire le binaire
      while (Serial.available() > 0) {
        Serial.read();
      }
      delay(100);
      
      uint32_t offset = 0;
      uint8_t buf[188];
      const uint32_t CHUNK_SIZE = 188 - 12;
      Serial.setTimeout(1000);
      while (offset < sizeBytes) {
        uint32_t toRead = (sizeBytes - offset > CHUNK_SIZE) ? CHUNK_SIZE : (sizeBytes - offset);
        int n = Serial.readBytes((char*)buf, toRead);
        if (n <= 0) { 
          Serial.println("ERROR: Serial read timeout"); 
          espnowHandler.removeFwTargetPeer();
          espnowHandler.setFwActive(false);
          espnowHandler.setFwTargetMac(nullptr);
          g_fwPushActive = false; 
          return; 
        }
        if ((uint32_t)n != toRead) { 
          Serial.println("ERROR: Serial read incomplete"); 
          espnowHandler.removeFwTargetPeer();
          espnowHandler.setFwActive(false);
          espnowHandler.setFwTargetMac(nullptr);
          g_fwPushActive = false; 
          return; 
        }
        uint32_t chunkCrc = crc32_finalize(crc32_update(crc32_init(), buf, n));
        bool sent = false;
        for (int retry = 0; retry < 10 && !sent; retry++) {
          if (retry > 0) {
            // Délai progressif pour ESP_ERR_ESPNOW_NO_MEM
            delay(retry * 10);
          }
          sent = espnowHandler.sendFwChunk(slaveManager.getSlaves()[id].mac, sessionId, offset, buf, n, chunkCrc);
          if (!sent && retry < 9) {
            // Si erreur NO_MEM, attendre un peu plus pour laisser la queue se vider
            delay(20);
          }
        }
        if (!sent) {
          Serial.printf("ERROR: Failed to send FW_CHUNK at offset %u after retries\n", offset);
          espnowHandler.removeFwTargetPeer();
          espnowHandler.setFwActive(false);
          espnowHandler.setFwTargetMac(nullptr);
          g_fwPushActive = false;
          return;
        }
        offset += n;
        
        // Attendre un peu pour laisser le Slave traiter et envoyer l'ACK
        delay(50);
        
        // Attendre l'ACK avant d'envoyer le chunk suivant
        uint32_t currentAck = espnowHandler.getLastFwAckOffset();
        Serial.printf("Waiting for ACK: current=%u expected=%u\n", currentAck, offset);
        if (!espnowHandler.waitForFwAck(offset, 3000)) {
          Serial.printf("ERROR: Timeout waiting for FW_ACK at offset %u (last received: %u)\n", offset, espnowHandler.getLastFwAckOffset());
          espnowHandler.removeFwTargetPeer();
          espnowHandler.setFwActive(false);
          espnowHandler.setFwTargetMac(nullptr);
          g_fwPushActive = false;
          return;
        }
        Serial.printf("ACK received: %u\n", espnowHandler.getLastFwAckOffset());
        
        if (offset % 10000 < n || offset == sizeBytes) {
          Serial.printf("Progress: %u/%u bytes (%.1f%%)\n", offset, sizeBytes, (float)offset * 100.0 / sizeBytes);
        }
      }
      Serial.setTimeout(1000);
      Serial.println("FWPUSH done, sending FW_END");
      espnowHandler.sendFwEnd(slaveManager.getSlaves()[id].mac, sessionId);
      delay(200);
      espnowHandler.removeFwTargetPeer();
      espnowHandler.setFwActive(false);
      espnowHandler.setFwTargetMac(nullptr);
      
      // Vider le buffer série après la lecture du binaire
      delay(100);
      while (Serial.available() > 0) {
        Serial.read();
      }
      
      Serial.println("Other slaves resumed");
      g_fwPushActive = false;
    }
  } else {
    Serial.println("ERROR: Unknown command");
    Serial.println("Commands: list, paired, pair [id], unpair [id], ping [id], send [id] [msg], broadcast [msg], stats, fwbegin [id] [size] [version] [session], fwchunk [hex], fwend");
  }
}

