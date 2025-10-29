#include "protocol.h"
#include "espnow_handler.h"
#include "at24c02.h"
#include "lm75a.h"
#include "ws2812b.h"
#include "button.h"
#include "led_status.h"
#include "tlc59116.h"
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
TLC59116 tlc1(TLC59116_ADDR_1);
TLC59116 tlc2(TLC59116_ADDR_2);

uint32_t lastTempCheck = 0;

void scanI2C() {
  Serial.println("\n=== I2C Bus Scan ===");
  Serial.println("Scanning all I2C addresses (0x08 to 0x77)...");
  
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  delay(10);
  
  uint8_t foundCount = 0;
  uint8_t foundAddresses[128];
  
  // Scan all valid I2C addresses (7-bit addresses: 0x08 to 0x77)
  for (uint8_t address = 0x08; address < 0x78; address++) {
    Wire.beginTransmission(address);
    uint8_t error = Wire.endTransmission();
    
    if (error == 0) {
      foundAddresses[foundCount] = address;
      foundCount++;
      
      // Identify known devices
      String deviceName = "Unknown device";
      if (address == 0x50) deviceName = "AT24C02 EEPROM";
      else if (address == 0x4C) deviceName = "LM75A Power";
      else if (address == 0x48) deviceName = "LM75A LED1";
      else if (address == 0x4E) deviceName = "LM75A LED2";
      else if (address == 0x68) deviceName = "TLC59116IPWR #1";
      else if (address == 0x61) deviceName = "TLC59116IPWR #2";
      
      Serial.print("  [0x");
      if (address < 16) Serial.print("0");
      Serial.print(address, HEX);
      Serial.print("] ");
      Serial.print(deviceName);
      Serial.print(" (error code: ");
      Serial.print(error);
      Serial.println(")");
    }
    
    // Small delay to allow bus to settle
    delay(1);
  }
  
  Serial.println();
  Serial.print("Total devices found: ");
  Serial.println(foundCount);
  
  if (foundCount == 0) {
    Serial.println("WARNING: No I2C devices detected! Check wiring.");
  } else {
    Serial.print("Found addresses: ");
    for (uint8_t i = 0; i < foundCount; i++) {
      Serial.print("0x");
      if (foundAddresses[i] < 16) Serial.print("0");
      Serial.print(foundAddresses[i], HEX);
      if (i < foundCount - 1) Serial.print(", ");
    }
    Serial.println();
  }
  
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
  
  // Check TLC59116IPWR controllers with retry
  bool tlc1Found = false;
  bool tlc2Found = false;
  
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(0x68);
    uint8_t error1 = Wire.endTransmission();
    if (error1 == 0) {
      tlc1Found = true;
      break;
    }
    delay(5);
  }
  
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(0x61);
    uint8_t error2 = Wire.endTransmission();
    if (error2 == 0) {
      tlc2Found = true;
      break;
    }
    delay(5);
  }
  
  if (tlc1Found) {
    Serial.println("OK: TLC59116IPWR #1 (0x68) connected");
  } else {
    Serial.println("WARNING: TLC59116IPWR #1 (0x68) not found");
  }
  
  if (tlc2Found) {
    Serial.println("OK: TLC59116IPWR #2 (0x61) connected");
  } else {
    Serial.println("WARNING: TLC59116IPWR #2 (0x61) not found");
  }
  
  return allOk;
}

void testTLC59116() {
  Serial.println("\n=== TLC59116IPWR Test ===");
  
  // Initialize controllers
  Serial.println("Initializing TLC59116IPWR #1 (0x68)...");
  bool tlc1Ok = tlc1.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  
  Serial.println("Initializing TLC59116IPWR #2 (0x61)...");
  bool tlc2Ok = tlc2.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  
  if (!tlc1Ok && !tlc2Ok) {
    Serial.println("ERROR: Both TLC59116IPWR controllers failed to initialize");
    Serial.println("=== End TLC59116IPWR Test ===\n");
    return;
  }
  
  if (!tlc1Ok) {
    Serial.println("WARNING: TLC59116IPWR #1 (0x68) failed - skipping test");
  }
  if (!tlc2Ok) {
    Serial.println("WARNING: TLC59116IPWR #2 (0x61) failed - skipping test");
  }
  
  Serial.println("Turning ON all LEDs...");
  if (tlc1Ok) {
    if (!tlc1.setAllPWM(0xFF)) {
      Serial.println("ERROR: Failed to turn ON LEDs for TLC59116IPWR #1 (0x68)");
    }
  }
  if (tlc2Ok) {
    if (!tlc2.setAllPWM(0xFF)) {
      Serial.println("ERROR: Failed to turn ON LEDs for TLC59116IPWR #2 (0x61)");
    }
  }
  delay(500);
  
  Serial.println("Turning OFF all LEDs...");
  if (tlc1Ok) {
    if (!tlc1.allOff()) {
      Serial.println("ERROR: Failed to turn OFF LEDs for TLC59116IPWR #1 (0x68)");
    }
  }
  if (tlc2Ok) {
    if (!tlc2.allOff()) {
      Serial.println("ERROR: Failed to turn OFF LEDs for TLC59116IPWR #2 (0x61)");
    }
  }
  delay(500);
  
  Serial.print("TLC59116IPWR test complete - #1: ");
  Serial.print(tlc1Ok ? "OK" : "FAILED");
  Serial.print(", #2: ");
  Serial.println(tlc2Ok ? "OK" : "FAILED");
  Serial.println("=== End TLC59116IPWR Test ===\n");
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
  
  // Test TLC59116IPWR controllers
  testTLC59116();
  
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
