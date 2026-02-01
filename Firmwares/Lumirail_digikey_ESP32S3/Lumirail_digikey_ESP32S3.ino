#include "config.h"
#include "bridge.h"
#include "USB.h"

HardwareSerial SerialModule(1);
static uint8_t lineBuf[LINE_BUF_MAX];
static size_t lineLen;
static bool sceneState;
static uint32_t sceneBytesRemaining;
static uint32_t sceneBytesLastMs;

void setup() {
  USB.productName(USB_PRODUCT_NAME);
  USB.manufacturerName(USB_MANUFACTURER);
  USB.serialNumber(USB_SERIAL_NUMBER);
  Serial.begin(115200);
  SerialModule.begin(UART_MODULE_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
  lineLen = 0;
  sceneState = false;
  usbPrint("LM-DK-ESP32S3 115200\n");
}

void loop() {
  while (SerialModule.available() && Serial.availableForWrite() > 0) {
    Serial.write(SerialModule.read());
  }

  if (sceneState) {
    if (Serial.available() && sceneBytesRemaining > 0) {
      char c = Serial.read();
      if (c == '\n' || c == '\r') {
        sceneState = false;
      } else {
        SerialModule.write(c);
        sceneBytesRemaining--;
        sceneBytesLastMs = millis();
      }
    }
    if (sceneBytesRemaining == 0) sceneState = false;
    else if ((millis() - sceneBytesLastMs) >= SCENE_BINARY_IDLE_MS) sceneState = false;
  }

  if (!sceneState && Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineLen > 0) {
        handleLine((const char*)lineBuf, lineLen, &sceneState, &sceneBytesRemaining, &sceneBytesLastMs);
        lineLen = 0;
      }
    } else {
      if (lineLen < LINE_BUF_MAX - 1) {
        lineBuf[lineLen++] = (uint8_t)c;
        if (tryQuickAck((const char*)lineBuf, lineLen)) {
          lineLen = 0;
        }
      } else {
        uartSendLine((const char*)lineBuf, lineLen);
        lineLen = 0;
        SerialModule.write(c);
      }
    }
  }
}
