#include "protocol.h"
#include "espnow_handler.h"
#include "at24c02.h"
#include "lm75a.h"
#include "ws2812b.h"
#include "button.h"
#include <esp_wifi.h>

#define I2C_SDA_PIN 18
#define I2C_SCL_PIN 19

AT24C02 eeprom(AT24C02_ADDR);
LM75A tempPower(LM75A_ADDR_POWER);
LM75A tempLed1(LM75A_ADDR_LED1);
LM75A tempLed2(LM75A_ADDR_LED2);
WS2812B statusLed(WS2812B_PIN, 1);
Button button(BUTTON_PIN, 1000);

bool checkComponents() {
  bool allOk = true;
  
  Serial.println("Checking I2C components...");
  
  if (!eeprom.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
    Serial.println("ERROR: AT24C02 EEPROM (0x50) not found");
    allOk = false;
  } else {
    Serial.println("OK: AT24C02 EEPROM (0x50) connected");
  }
  
  if (!tempPower.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
    Serial.println("ERROR: LM75A Power (0x4C) not found");
    allOk = false;
  } else {
    Serial.println("OK: LM75A Power (0x4C) connected");
  }
  
  if (!tempLed1.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
    Serial.println("ERROR: LM75A LED1 (0x48) not found");
    allOk = false;
  } else {
    Serial.println("OK: LM75A LED1 (0x48) connected");
  }
  
  if (!tempLed2.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
    Serial.println("ERROR: LM75A LED2 (0x4E) not found");
    allOk = false;
  } else {
    Serial.println("OK: LM75A LED2 (0x4E) connected");
  }
  
  return allOk;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("LumiRail Slave - Starting...");
  
  if (!checkComponents()) {
    Serial.println("WARNING: Some components are missing. Continuing anyway...");
  } else {
    Serial.println("All I2C components detected successfully");
  }
  
  statusLed.begin();
  statusLed.setPixel(0, 0, 255, 0);
  statusLed.show();
  Serial.println("OK: WS2812B LED initialized");
  
  button.begin();
  Serial.println("OK: Button initialized");
  
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
  button.update();
  
  if (button.isPressed()) {
    Serial.println("Button pressed");
  }
  
  if (button.isHeld()) {
    Serial.println("Button held");
  }
  
  if (button.isReleased()) {
    Serial.println("Button released");
  }
  
  espnowHandler.update();
  delay(50);
}
