#include "serial_commands.h"
#include "slave_manager.h"
#include "espnow_handler.h"

SerialCommands serialCommands;

SerialCommands::SerialCommands() {}

void SerialCommands::init() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("LumiRail Master - Starting...");
}

void SerialCommands::process() {
  if (!Serial.available()) return;
  
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  handleCommand(cmd);
}

void SerialCommands::handleCommand(const String& cmd) {
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
    
  } else {
    Serial.println("ERROR: Unknown command");
    Serial.println("Commands: list, paired, pair [id], unpair [id], ping [id], send [id] [msg], broadcast [msg], stats");
  }
}

