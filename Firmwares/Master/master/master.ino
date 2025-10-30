#include "protocol.h"
#include "serial_commands.h"
#include "slave_manager.h"
#include "espnow_handler.h"
#include <esp_wifi.h>
#include <WiFi.h>

WiFiServer fwServer(5001);
IPAddress apIP;

void setup() {
  serialCommands.init();
  
  uint32_t r = esp_random();
  uint8_t third = 50 + (r % 150);
  apIP = IPAddress(192,168,third,1);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255,255,255,0));
  WiFi.softAP("LumiRail", NULL, 1, 0, 1);
  fwServer.begin();
  
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
  
  Serial.print("AP IP: "); Serial.println(apIP);
  // AP already configured above; ensure message and help printed
  Serial.println("Master Ready");
  Serial.println("Commands: list, paired, pair [id], unpair [id], ping [id], send [id] [msg], broadcast [msg], stats, fwpush [id] [size] [ver] [sess] [crc]");
}

void loop() {
  serialCommands.process();
  slaveManager.update();
  espnowHandler.update();
  
  delay(10);
}
