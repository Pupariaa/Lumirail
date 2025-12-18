#include "protocol.h"
#include "espnow_handler.h"
#include "at24c02.h"
#include "eeprom_config.h"
#include "ws2812b.h"
#include "button.h"
#include "led_status.h"
#include "tlc59116.h"
#include <esp_wifi.h>

#define I2C_SDA_PIN 25
#define I2C_SCL_PIN 26
#define TEMP_THRESHOLD 38.0
#define TEMP_CHECK_INTERVAL 2000

#define POWER_DETECT_PIN 35
#define LED_PWR_PIN 5
#define LED_ERR_PIN 13
#define LED_ACT_PIN 15

AT24C02 eeprom(AT24C02_ADDR);
EepromConfig eepromConfig(&eeprom);
WS2812B statusLed(WS2812B_PIN, 1);
LedStatus ledStatus(&statusLed);
Button button(BUTTON_PIN, 1000);
TLC59116 tlc1(0x40);
TLC59116 tlc2(0x60);

// Temporary: Set to true once to configure serial/model, then set back to false
#define ENABLE_EEPROM_CONFIG false
#define ENABLE_FLASH_WRITE_TEST false

bool debugMode = false;
uint32_t lastTempCheck = 0;

void processSerialCommands() {
  if (!Serial.available()) return;
  
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  
  if (cmd.startsWith("debug_set=")) {
    String value = cmd.substring(10);
    if (value == "true") {
      debugMode = true;
      Serial.print("DEBUG MODE ENABLED\n");
      Serial.println("");
    } else if (value == "false") {
      debugMode = false;
      Serial.print("DEBUG MODE DISABLED\n");
      Serial.println("");
    }
    return;
  }
  
  if (!debugMode) return;
  
  if (cmd.startsWith("led_set=")) {
    int commaIndex = cmd.indexOf(',');
    if (commaIndex > 0) {
      uint8_t ledIndex = cmd.substring(8, commaIndex).toInt();
      uint8_t brightness = cmd.substring(commaIndex + 1).toInt();
      if (setLed(ledIndex, brightness)) {
        Serial.printf("LED %d set to %d\n", ledIndex, brightness);
        Serial.println("");
      } else {
        Serial.printf("ERROR: Failed to set LED %d\n", ledIndex);
        Serial.println("");
      }
    }
    return;
  }
  
  if (cmd == "led_all_off") {
    for (uint8_t i = 1; i <= 32; i++) {
      setLed(i, 0);
    }
    Serial.print("All LEDs turned OFF\n");
    Serial.println("");
    return;
  }
  
  if (cmd == "led_all_on") {
    for (uint8_t i = 1; i <= 32; i++) {
      setLed(i, 255);
    }
    Serial.print("All LEDs turned ON\n");
    Serial.println("");
    return;
  }
  
  if (cmd == "pca_status") {
    Serial.printf("PCA #1 (0x40): isPresent=%d\n", tlc1.isPresent());
    Serial.printf("PCA #2 (0x60): isPresent=%d\n", tlc2.isPresent());
    if (!tlc1.isPresent()) {
      Serial.print("Attempting to initialize PCA #1...\n");
      if (tlc1.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
        Serial.print("PCA #1 initialized successfully\n");
        Serial.println("");
      } else {
        Serial.print("PCA #1 initialization failed\n");
        Serial.println("");
      }
    }
    if (!tlc2.isPresent()) {
      Serial.print("Attempting to initialize PCA #2...\n");
      if (tlc2.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
        Serial.print("PCA #2 initialized successfully\n");
        Serial.println("");
      } else {
        Serial.print("PCA #2 initialization failed\n");
      }
    }
    return;
  }
  
  if (cmd == "help") {
    Serial.print("=== DEBUG COMMANDS ===\n");
    Serial.print("debug_set=true/false - Enable/disable debug mode\n");
    Serial.print("led_set=<index>,<brightness> - Set LED (1-32) to brightness (0-255)\n");
    Serial.print("led_all_off - Turn off all LEDs\n");
    Serial.print("led_all_on - Turn on all LEDs at max brightness\n");
    Serial.print("pca_status - Check PCA initialization status\n");
    Serial.print("help - Show this help\n");
    return;
  }
}

bool setLed(uint8_t ledIndex, uint8_t brightness) {
  if (ledIndex == 0 || ledIndex > 32) {
    if (debugMode) Serial.printf("ERROR: Invalid LED index %d (must be 1-32)\n", ledIndex);
    return false;
  }
  
  uint8_t pcaIndex;
  uint8_t channel;
  
  if (ledIndex >= 1 && ledIndex <= 8) {
    pcaIndex = 0;
    channel = ledIndex - 1;
  } else if (ledIndex >= 9 && ledIndex <= 16) {
    pcaIndex = 1;
    channel = ledIndex - 9;
  } else if (ledIndex >= 17 && ledIndex <= 24) {
    pcaIndex = 1;
    channel = ledIndex - 9;
  } else if (ledIndex >= 25 && ledIndex <= 32) {
    pcaIndex = 0;
    channel = ledIndex - 17;
  } else {
    return false;
  }
  
  TLC59116* pca = (pcaIndex == 0) ? &tlc1 : &tlc2;
  
  if (debugMode) {
    Serial.printf("DEBUG: Setting LED %d -> PCA%d channel %d to brightness %d\n", ledIndex, pcaIndex, channel, brightness);
    Serial.println("");
    Serial.printf("DEBUG: PCA%d isPresent=%d\n", pcaIndex, pca->isPresent());
    Serial.println("");
  }
  
  if (!pca->isPresent()) {
    if (debugMode) Serial.printf("ERROR: PCA%d not initialized, attempting to initialize...\n", pcaIndex);
    if (!pca->begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
      if (debugMode) Serial.printf("ERROR: Failed to initialize PCA%d\n", pcaIndex);
      return false;
    }
  }
  
  bool result = pca->setPWM(channel, brightness);
  if (debugMode) {
    if (result) {
      Serial.printf("OK: LED %d -> PCA%d channel %d set to %d\n", ledIndex, pcaIndex, channel, brightness);
      Serial.println("");
    } else {
      Serial.printf("ERROR: Failed to set PWM on PCA%d channel %d for LED %d\n", pcaIndex, channel, ledIndex);
      Serial.println("");
    }
  }
  return result;
}

void scanI2C() {
  if (debugMode) {
    Serial.print("\n=== I2C Bus Scan ===\n");
    Serial.println("");
    Serial.print("Scanning all I2C addresses (0x08 to 0x77)...\n");
    Serial.println("");
  }
  
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(1000);
  delay(10);
  
  uint8_t foundCount = 0;
  uint8_t foundAddresses[128];
  
  for (uint8_t address = 0x08; address < 0x78; address++) {
    Wire.beginTransmission(address);
    uint8_t error = Wire.endTransmission();
    
    if (error == 0) {
      foundAddresses[foundCount] = address;
      foundCount++;
      
      String deviceName = "Unknown device";
      if (address == 0x50) deviceName = "AT24C02 EEPROM";
      else if (address == 0x4C) deviceName = "LM75A Power";
      else if (address == 0x48) deviceName = "LM75A LED1";
      else if (address == 0x4E) deviceName = "LM75A LED2";
      else if (address == 0x40) deviceName = "PCA985PW #1";
      else if (address == 0x60) deviceName = "PCA985PW #2";
      else if (address == 0x6B) deviceName = "TLC59116 All-Call (reset)";
      else if (address == 0x00) deviceName = "I2C General Call (reset)";
      
      if (debugMode) {
        Serial.print("  [0x");
        if (address < 16) Serial.print("0");
        Serial.print(address, HEX);
        Serial.print("] ");
        Serial.print(deviceName);
        Serial.print(" (error code: ");
        Serial.print(error);
        Serial.print(")\n");
      }
    }
    
    delay(1);
  }
  
  if (debugMode) {
    Serial.print("\n");
    Serial.print("Total devices found: ");
    Serial.print(foundCount);
    Serial.print("\n");
    Serial.print("Found addresses: ");
    for (uint8_t i = 0; i < foundCount; i++) {
      Serial.print("0x");
      if (foundAddresses[i] < 16) Serial.print("0");
      Serial.print(foundAddresses[i], HEX);
      if (i < foundCount - 1) Serial.print(", ");
    }
    Serial.print("\n");
    Serial.print("=== End I2C Scan ===\n\n");
  }
  
  if (foundCount == 0) {
    Serial.print("WARNING: No I2C devices detected! Check wiring.\n");
  }
}

bool checkComponents() {
  bool allOk = true;

  
  scanI2C();
  
  if (!eeprom.begin(I2C_SDA_PIN, I2C_SCL_PIN)) {
    Serial.print("ERROR: AT24C02 EEPROM (0x50) not found\n");
    allOk = false;
    ledStatus.setState(LED_STATE_IO_ERROR);
  } else {
  }
  
  
  bool pca1Found = false;
  bool pca2Found = false;
  
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(0x40);
    uint8_t error1 = Wire.endTransmission(true);
    if (error1 == 0) {
      pca1Found = true;
      break;
    }
    delay(5);
  }
  
  for (uint8_t retry = 0; retry < 3; retry++) {
    Wire.beginTransmission(0x60);
    uint8_t error2 = Wire.endTransmission(true);
    if (error2 == 0) {
      pca2Found = true;
      break;
    }
    delay(5);
  }
  
  if (!pca1Found) {
    Serial.print("WARNING: PCA985PW #1 (0x40) not found\n");
    Serial.println("");
  } else if (debugMode) {
    Serial.print("OK: PCA985PW #1 (0x40) found\n");
    Serial.println("");
  }
  
  if (!pca2Found) {
    Serial.print("WARNING: PCA985PW #2 (0x60) not found\n");
    Serial.println("");
  } else if (debugMode) {
    Serial.print("OK: PCA985PW #2 (0x60) found\n");
    Serial.println("");
  }
  
  return allOk;
}

void testPCA985PW() {
  bool pca1Ok = tlc1.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  bool pca2Ok = tlc2.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  
  if (!pca1Ok && !pca2Ok) {
    Serial.print("ERROR: Both PCA985PW controllers failed to initialize\n");
    return;
  }
  
  if (!pca1Ok) {
    Serial.print("WARNING: PCA985PW #1 (0x40) failed - skipping test\n");
  }
  if (!pca2Ok) {
    Serial.print("WARNING: PCA985PW #2 (0x60) failed - skipping test\n");
  }
  
  if (pca1Ok) {
    if (!tlc1.setAllPWM(0xFF)) {
      Serial.print("ERROR: Failed to turn ON LEDs for PCA985PW #1 (0x40)\n");
    }
  }
  if (pca2Ok) {
    if (!tlc2.setAllPWM(0xFF)) {
      Serial.print("ERROR: Failed to turn ON LEDs for PCA985PW #2 (0x60)\n");
    }
  }
  delay(500);
  
  if (pca1Ok) {
    if (!tlc1.allOff()) {
      Serial.print("ERROR: Failed to turn OFF LEDs for PCA985PW #1 (0x40)\n");
    }
  }
  if (pca2Ok) {
    if (!tlc2.allOff()) {
      Serial.print("ERROR: Failed to turn OFF LEDs for PCA985PW #2 (0x60)\n");
    }
  }
  delay(500);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.print("LumiRail Slave - Starting...\n");



  
  statusLed.begin();
  ledStatus.begin();
  ledStatus.setState(LED_STATE_INIT);
  
  
  
  if (!checkComponents()) {
    Serial.print("WARNING: Some components are missing. Continuing anyway...\n");
    if (ledStatus.getState() != LED_STATE_IO_ERROR) {
      ledStatus.setState(LED_STATE_WAITING_PAIR);
    }
  } else {
    ledStatus.setState(LED_STATE_WAITING_PAIR);
  }
  
  pinMode(POWER_DETECT_PIN, INPUT);
  pinMode(LED_PWR_PIN, OUTPUT);
  pinMode(LED_ERR_PIN, OUTPUT);
  pinMode(LED_ACT_PIN, OUTPUT);
  digitalWrite(LED_PWR_PIN, HIGH);
  digitalWrite(LED_ERR_PIN, HIGH);
  digitalWrite(LED_ACT_PIN, HIGH);
  
  testPCA985PW();
  
  if (eeprom.isPresent()) {
    eepromConfig.init();
    if (ENABLE_EEPROM_CONFIG) {
      Serial.print("\n=== Configuring EEPROM (ONE-TIME SETUP) ===\n");
      Serial.print("FORCING OVERWRITE - Will write new values regardless of existing data\n");
      char currentSerial[9] = {0};
      char currentModel[9] = {0};
      bool hasSerial = eepromConfig.getSerialNumber(currentSerial, 9);
      bool hasModel = eepromConfig.getModel(currentModel, 9);
      
      Serial.print("\n--- Current EEPROM contents (will be overwritten) ---\n");
      if (hasSerial) {
        Serial.print("  Current serial: ");
        Serial.print(currentSerial);
        Serial.print("\n");
      } else {
        Serial.print("  Current serial: Not set\n");
      }
      if (hasModel) {
        Serial.print("  Current model: ");
        Serial.print(currentModel);
        Serial.print("\n");
      } else {
        Serial.print("  Current model: Not set\n");
      }
      
      Serial.print("\n--- Writing new values (FORCING overwrite) ---\n");
      
      const char* serial = "28F028G";
      Serial.print("Attempting to write serial: ");
      Serial.print(serial);
      Serial.print("\n");
      bool serialOk = eepromConfig.setSerialNumber(serial);
      
      const char* model = "LMSS1G2"; 
      Serial.print("Attempting to write model: ");
      Serial.print(model);
      Serial.print("\n");
      bool modelOk = eepromConfig.setModel(model);
      
      delay(50);
      
      Serial.print("\n--- Verifying stored values ---\n");
      char verifySerial[9] = {0};
      char verifyModel[9] = {0};
      bool gotSerial = eepromConfig.getSerialNumber(verifySerial, 9);
      bool gotModel = eepromConfig.getModel(verifyModel, 9);
      
      if (gotSerial) {
        Serial.print("  Read Serial: '");
        Serial.print(verifySerial);
        Serial.print("' - ");
        if (strcmp(verifySerial, serial) == 0) {
          Serial.print("MATCH! ✓\n");
        } else {
          Serial.print("MISMATCH! ✗\n");
          Serial.print("    Expected: '");
          Serial.print(serial);
          Serial.print("'\n");
        }
      } else {
        Serial.print("  FAILED to read serial!\n");
      }
      
      if (gotModel) {
        Serial.print("  Read Model: '");
        Serial.print(verifyModel);
        Serial.print("' - ");
        if (strcmp(verifyModel, model) == 0) {
          Serial.print("MATCH! ✓\n");
        } else {
          Serial.print("MISMATCH! ✗\n");
          Serial.print("    Expected: '");
          Serial.print(model);
          Serial.print("'\n");
        }
      } else {
        Serial.print("  FAILED to read model!\n");
      }
      
      Serial.print("\n=== EEPROM Configuration Complete ===\n");
      if (serialOk && modelOk && strcmp(verifySerial, serial) == 0 && strcmp(verifyModel, model) == 0) {
        Serial.print("SUCCESS! Values written and verified.\n");
        Serial.print("Set ENABLE_EEPROM_CONFIG to false and recompile!\n");
      } else {
        Serial.print("WARNING: Write may have failed or verification failed!\n");
      }
      Serial.print("\n");
    } else {
      // Just read and display current config
      char serial[9];
      char model[9];
      if (eepromConfig.getSerialNumber(serial, 9)) {
        Serial.print("Serial Number: ");
        Serial.print(serial);
        Serial.print("\n");
      } else {
        Serial.print("Serial Number: Not set\n");
      }
      
      if (eepromConfig.getModel(model, 9)) {
        Serial.print("Model: ");
        Serial.print(model);
        Serial.print("\n");
      } else {
        Serial.print("Model: Not set\n");
      }
      
      uint8_t authMAC[6];
      if (eepromConfig.getAuthorizedMAC(authMAC)) {
  Serial.print("Authorized Master MAC: ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", authMAC[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.print("\n");
      } else {
        Serial.print("Authorized Master MAC: None (any master can pair)\n");
      }
    }
  }
  
  // Initialize ESP-NOW with EEPROM config
  if (eeprom.isPresent()) {
    espnowHandler.init(&eepromConfig);
  } else {
    espnowHandler.init();
  }
  
  uint8_t mac[6];
  esp_wifi_get_mac(WIFI_IF_STA, mac);
  Serial.print("Slave MAC: ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.print("\n");
  
  Serial.print("Slave Ready\n");
  Serial.print("V0.0.1\n");
}

void checkPowerDetect() {
  if (debugMode) {
    static uint32_t lastPwrToggle = 0;
    static bool pwrState = false;
    uint32_t now = millis();
    
    if (pwrState) {
      if (now - lastPwrToggle >= 1000) {
        pwrState = false;
        digitalWrite(LED_PWR_PIN, HIGH);
        lastPwrToggle = now;
      }
    } else {
      if (now - lastPwrToggle >= 2000) {
        pwrState = true;
        digitalWrite(LED_PWR_PIN, LOW);
        lastPwrToggle = now;
      }
    }
  } else {
    bool hasExternalPower = digitalRead(POWER_DETECT_PIN) == LOW;
  
  if (debugMode) {
    static uint32_t lastPowerLog = 0;
    if (millis() - lastPowerLog > 5000) {
      Serial.printf("DEBUG: POWER_DETECT_PIN=%d hasExternalPower=%d\n", digitalRead(POWER_DETECT_PIN), hasExternalPower);
      lastPowerLog = millis();
    }
  }
    digitalWrite(LED_PWR_PIN, hasExternalPower ? LOW : HIGH);
  }
}

void checkTemperatures() {
  
}

void loop() {
  processSerialCommands();
  
  ledStatus.update();
  
  checkPowerDetect();
  checkTemperatures();
  
  SlaveState espState = espnowHandler.getCurrentState();
  
  LedState currentLedState = ledStatus.getState();
  
  bool hasExternalPower = digitalRead(POWER_DETECT_PIN) == LOW;
  
  if (debugMode) {
    static uint32_t lastPowerLog = 0;
    if (millis() - lastPowerLog > 5000) {
      Serial.printf("DEBUG: POWER_DETECT_PIN=%d hasExternalPower=%d\n", digitalRead(POWER_DETECT_PIN), hasExternalPower);
      lastPowerLog = millis();
    }
  }
  static uint32_t lastErrBlink = 0;
  static bool errState = false;
  uint32_t now = millis();
  
  if (!hasExternalPower) {
    if (now - lastErrBlink > 500) {
      errState = !errState;
      digitalWrite(LED_ERR_PIN, errState ? LOW : HIGH);
      lastErrBlink = now;
    }
  } else {
    bool isError = (currentLedState == LED_STATE_IO_ERROR || currentLedState == LED_STATE_COMM_ERROR);
    if (isError) {
      if (now - lastErrBlink > 500) {
        errState = !errState;
        digitalWrite(LED_ERR_PIN, errState ? LOW : HIGH);
        lastErrBlink = now;
      }
    } else {
      digitalWrite(LED_ERR_PIN, HIGH);
    }
  }
  
  static uint32_t lastActBlink = 0;
  static bool actState = false;
  bool hasActivity = espnowHandler.hasCommandReceived() || espState == STATE_LINKED;
  if (hasActivity) {
    uint32_t nowAct = millis();
    if (nowAct - lastActBlink > 500) {
      actState = !actState;
      digitalWrite(LED_ACT_PIN, actState ? LOW : HIGH);
      lastActBlink = nowAct;
    }
  } else {
    digitalWrite(LED_ACT_PIN, HIGH);
    actState = false;
  }
  
  if (espnowHandler.hasCommandReceived()) {
    ledStatus.setState(LED_STATE_COMMAND_RECEIVED);
  }
  
  if (espState == STATE_UNPAIRED) {
    if (currentLedState != LED_STATE_WAITING_PAIR && 
        currentLedState != LED_STATE_INIT &&
        currentLedState != LED_STATE_IO_ERROR &&
        currentLedState != LED_STATE_COMM_ERROR) {
      ledStatus.setState(LED_STATE_UNPAIRED);
    }
  } else if (espState == STATE_DISCOVERED) {
    if (currentLedState != LED_STATE_WAITING_PAIR && currentLedState != LED_STATE_IO_ERROR && currentLedState != LED_STATE_COMM_ERROR) {
      ledStatus.setState(LED_STATE_WAITING_PAIR);
    }
  } else if (espState == STATE_LINKED) {
    if (currentLedState != LED_STATE_PAIRED && currentLedState != LED_STATE_COMMAND_RECEIVED && currentLedState != LED_STATE_IO_ERROR && currentLedState != LED_STATE_COMM_ERROR) {
      ledStatus.setState(LED_STATE_PAIRED);
    }
  }
  
  
  espnowHandler.update();
  delay(50);
}
