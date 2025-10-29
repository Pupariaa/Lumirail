#include "protocol.h"
#include "espnow_handler.h"
#include "at24c02.h"
#include "lm75a.h"
#include "ws2812b.h"
#include "button.h"
#include "led_status.h"
#include <esp_wifi.h>

#define I2C_SDA_PIN 18
#define I2C_SCL_PIN 19
#define TEMP_THRESHOLD 70.0
#define TEMP_CHECK_INTERVAL 2000

AT24C02 eeprom(AT24C02_ADDR);
LM75A tempPower(LM75A_ADDR_POWER);
LM75A tempLed1(LM75A_ADDR_LED1);
LM75A tempLed2(LM75A_ADDR_LED2);
WS2812B statusLed(WS2812B_PIN, 1);
LedStatus ledStatus(&statusLed);
Button button(BUTTON_PIN, 1000);

uint32_t lastTempCheck = 0;

bool checkComponents() {
  bool allOk = true;
  
  Serial.println("Checking I2C components...");
  
  if (!eeprom.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
    Serial.println("ERROR: AT24C02 EEPROM (0x50) not found");
    allOk = false;
    ledStatus.setState(LED_STATE_IO_ERROR);
  } else {
    Serial.println("OK: AT24C02 EEPROM (0x50) connected");
  }
  
  if (!tempPower.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
    Serial.println("ERROR: LM75A Power (0x4C) not found");
    allOk = false;
    ledStatus.setState(LED_STATE_IO_ERROR);
  } else {
    Serial.println("OK: LM75A Power (0x4C) connected");
  }
  
  if (!tempLed1.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
    Serial.println("ERROR: LM75A LED1 (0x48) not found");
    allOk = false;
    ledStatus.setState(LED_STATE_IO_ERROR);
  } else {
    Serial.println("OK: LM75A LED1 (0x48) connected");
  }
  
  if (!tempLed2.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
    Serial.println("ERROR: LM75A LED2 (0x4E) not found");
    allOk = false;
    ledStatus.setState(LED_STATE_IO_ERROR);
  } else {
    Serial.println("OK: LM75A LED2 (0x4E) connected");
  }
  
  return allOk;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("LumiRail Slave - Starting...");
  
  statusLed.begin();
  ledStatus.begin();
  ledStatus.setState(LED_STATE_INIT);
  Serial.println("OK: WS2812B LED initialized");
  
  button.begin();
  Serial.println("OK: Button initialized");
  
  if (!checkComponents()) {
    Serial.println("WARNING: Some components are missing. Continuing anyway...");
    if (ledStatus.getState() != LED_STATE_IO_ERROR) {
      ledStatus.setState(LED_STATE_WAITING_PAIR);
    }
  } else {
    Serial.println("All I2C components detected successfully");
    ledStatus.setState(LED_STATE_WAITING_PAIR);
  }
  
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

void checkTemperatures() {
  uint32_t now = millis();
  if (now - lastTempCheck < TEMP_CHECK_INTERVAL) {
    return;
  }
  lastTempCheck = now;
  
  float tempP = tempPower.readTemperature();
  float tempL1 = tempLed1.readTemperature();
  float tempL2 = tempLed2.readTemperature();
  
  if (tempP > TEMP_THRESHOLD) {
    Serial.print("WARNING: Power temperature excessive: ");
    Serial.print(tempP);
    Serial.println("°C");
    ledStatus.setState(LED_STATE_TEMP_OVERHEAT_POWER);
    return;
  }
  
  if (tempL1 > TEMP_THRESHOLD) {
    Serial.print("WARNING: LED Driver 1 temperature excessive: ");
    Serial.print(tempL1);
    Serial.println("°C");
    ledStatus.setState(LED_STATE_TEMP_OVERHEAT_LED1);
    return;
  }
  
  if (tempL2 > TEMP_THRESHOLD) {
    Serial.print("WARNING: LED Driver 2 temperature excessive: ");
    Serial.print(tempL2);
    Serial.println("°C");
    ledStatus.setState(LED_STATE_TEMP_OVERHEAT_LED2);
    return;
  }
  
  LedState currentLedState = ledStatus.getState();
  if (currentLedState == LED_STATE_TEMP_OVERHEAT_POWER ||
      currentLedState == LED_STATE_TEMP_OVERHEAT_LED1 ||
      currentLedState == LED_STATE_TEMP_OVERHEAT_LED2) {
    SlaveState espState = espnowHandler.getCurrentState();
    if (espState == STATE_LINKED) {
      ledStatus.setState(LED_STATE_PAIRED);
    } else if (espState == STATE_DISCOVERED) {
      ledStatus.setState(LED_STATE_WAITING_PAIR);
    } else {
      ledStatus.setState(LED_STATE_UNPAIRED);
    }
  }
}

void loop() {
  ledStatus.update();
  button.update();
  
  checkTemperatures();
  
  SlaveState espState = espnowHandler.getCurrentState();
  
  if (espnowHandler.hasCommandReceived()) {
    ledStatus.setState(LED_STATE_COMMAND_RECEIVED);
  }
  
  LedState currentLedState = ledStatus.getState();
  bool isTempError = (currentLedState == LED_STATE_TEMP_OVERHEAT_POWER ||
                      currentLedState == LED_STATE_TEMP_OVERHEAT_LED1 ||
                      currentLedState == LED_STATE_TEMP_OVERHEAT_LED2);
  
  if (!isTempError) {
    if (espState == STATE_UNPAIRED) {
      if (currentLedState != LED_STATE_WAITING_PAIR && 
          currentLedState != LED_STATE_INIT &&
          currentLedState != LED_STATE_IO_ERROR) {
        ledStatus.setState(LED_STATE_UNPAIRED);
      }
    } else if (espState == STATE_DISCOVERED) {
      if (currentLedState != LED_STATE_WAITING_PAIR) {
        ledStatus.setState(LED_STATE_WAITING_PAIR);
      }
    } else if (espState == STATE_LINKED) {
      if (currentLedState != LED_STATE_PAIRED) {
        ledStatus.setState(LED_STATE_PAIRED);
      }
    }
  }
  
  if (button.isPressed()) {
    Serial.println("Button pressed");
  }
  
  if (button.isHeld()) {
    Serial.println("Button held - Resetting...");
    ledStatus.setState(LED_STATE_RESETTING);
    delay(2000);
    ESP.restart();
  }
  
  if (button.isReleased()) {
    Serial.println("Button released");
  }
  
  espnowHandler.update();
  delay(50);
}
