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
#define TEMP_THRESHOLD 38.0
#define TEMP_CHECK_INTERVAL 2000

AT24C02 eeprom(AT24C02_ADDR);
LM75A tempPower(LM75A_ADDR_POWER);
LM75A tempLed1(LM75A_ADDR_LED1);
LM75A tempLed2(LM75A_ADDR_LED2);
WS2812B statusLed(WS2812B_PIN, 1);
LedStatus ledStatus(&statusLed);
Button button(BUTTON_PIN, 1000);

uint32_t lastTempCheck = 0;

void scanI2C() {
  Serial.println("\n=== I2C Bus Scan ===");
  Serial.println("Scanning I2C addresses from 0x08 to 0x77...");
  
  uint8_t foundCount = 0;
  uint8_t foundAddresses[128];
  
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  
  for (uint8_t address = 0x08; address < 0x78; address++) {
    Wire.beginTransmission(address);
    uint8_t error = Wire.endTransmission();
    
    if (error == 0) {
      foundAddresses[foundCount] = address;
      foundCount++;
      
      // Identify known devices
      String deviceName = "Unknown";
      if (address == 0x50) deviceName = "AT24C02 EEPROM";
      else if (address == 0x4C) deviceName = "LM75A Power";
      else if (address == 0x48) deviceName = "LM75A LED1";
      else if (address == 0x4E) deviceName = "LM75A LED2";
      else if (address == 0x60) deviceName = "TLC59116IPWR #1";
      else if (address == 0x61) deviceName = "TLC59116IPWR #2";
      
      Serial.print("  [0x");
      if (address < 16) Serial.print("0");
      Serial.print(address, HEX);
      Serial.print("] ");
      Serial.println(deviceName);
    } else if (error == 4) {
      Serial.print("  [0x");
      if (address < 16) Serial.print("0");
      Serial.print(address, HEX);
      Serial.println("] Unknown error");
    }
    delay(1);
  }
  
  Serial.print("\nTotal devices found: ");
  Serial.println(foundCount);
  Serial.println("=== End I2C Scan ===\n");
}

bool checkComponents() {
  bool allOk = true;
  
  Serial.println("Checking I2C components...");
  
  // First, scan all I2C addresses for debug
  scanI2C();
  
  // Check known devices
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
  
  // Check TLC59116IPWR controllers
  Wire.beginTransmission(0x60);
  uint8_t error1 = Wire.endTransmission();
  if (error1 == 0) {
    Serial.println("OK: TLC59116IPWR #1 (0x60) connected");
  } else {
    Serial.println("WARNING: TLC59116IPWR #1 (0x60) not found");
  }
  
  Wire.beginTransmission(0x61);
  uint8_t error2 = Wire.endTransmission();
  if (error2 == 0) {
    Serial.println("OK: TLC59116IPWR #2 (0x61) connected");
  } else {
    Serial.println("WARNING: TLC59116IPWR #2 (0x61) not found");
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
  
  float tempP = -999.0;
  float tempL1 = -999.0;
  float tempL2 = -999.0;
  
  if (tempPower.isPresent()) {
    tempP = tempPower.readTemperature();
  }
  
  if (tempLed1.isPresent()) {
    tempL1 = tempLed1.readTemperature();
  }
  
  if (tempLed2.isPresent()) {
    tempL2 = tempLed2.readTemperature();
  }
  
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
