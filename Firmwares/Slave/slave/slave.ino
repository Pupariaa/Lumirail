#include "protocol.h"
#include "espnow_handler.h"
#include <esp_wifi.h>

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("LumiRail Slave - Starting...");
  
  espnowHandler.init();
  
  uint8_t mac[6];
  esp_wifi_get_mac(WIFI_IF_STA, mac);
  Serial.print("Slave MAC: ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.println();
  
  Serial.println("Slave Ready");
}

void loop() {
  espnowHandler.update();
  delay(50);
}
