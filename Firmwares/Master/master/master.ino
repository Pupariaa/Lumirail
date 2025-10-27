#include "protocol.h"
#include "serial_commands.h"
#include "slave_manager.h"
#include "espnow_handler.h"
#include <esp_wifi.h>

void setup() {
  serialCommands.init();
  
  espnowHandler.init();
  slaveManager.init();
  
  uint8_t mac[6];
  esp_wifi_get_mac(WIFI_IF_STA, mac);
  Serial.print("Master MAC: ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.println();
  
  Serial.println("Master Ready");
  Serial.println("Commands: list, paired, pair [id], unpair [id], ping [id], send [id] [msg], broadcast [msg], stats");
}

void loop() {
  serialCommands.process();
  slaveManager.update();
  espnowHandler.update();
  
  delay(10);
}
