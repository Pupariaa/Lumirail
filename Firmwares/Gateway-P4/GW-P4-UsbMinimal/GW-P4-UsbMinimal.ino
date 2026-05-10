#include <Arduino.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#ifndef GW_USB_PRODUCT
#define GW_USB_PRODUCT "Lumirail GW-P4 minimal"
#endif

#if __has_include("USBCDC.h")
#include "USB.h"
#include "USBCDC.h"
USBCDC GwCdc;
#define GW_STREAM GwCdc
#define GW_USB_CDC 1
#else
#define GW_STREAM Serial
#define GW_USB_CDC 0
#endif

static void gwPrintLn(const char* s) {
  GW_STREAM.println(s);
  GW_STREAM.flush();
}

static void emitGwMon() {
  uint32_t heap = ESP.getFreeHeap();
  uint32_t mhz = ESP.getCpuFreqMHz();
  uint32_t mhzLp = (mhz > 200u) ? 160u : mhz;
  float tc = temperatureRead();
  bool haveChipTemp = !isnan(tc) && tc >= -55.f && tc <= 155.f;
  char json[512];
  char line[576];
  if (haveChipTemp) {
    int itemp = (int)lroundf(tc);
    snprintf(
        json, sizeof(json),
        "{\"schema\":1,\"p4\":{\"heap\":%lu,\"intTempC\":%d,\"fw\":\"P4-MIN\",\"rail\":{\"sensorOk\":false},"
        "\"cpus\":[{\"mhz\":%lu,\"t\":%d},{\"mhz\":%lu,\"t\":%d},{\"mhz\":%lu,\"t\":%d}]}}",
        (unsigned long)heap, itemp, (unsigned long)mhz, itemp, (unsigned long)mhz, itemp,
        (unsigned long)mhzLp, itemp);
  } else {
    snprintf(
        json, sizeof(json),
        "{\"schema\":1,\"p4\":{\"heap\":%lu,\"fw\":\"P4-MIN\",\"rail\":{\"sensorOk\":false},\"cpus\":[{\"mhz\":%lu},"
        "{\"mhz\":%lu},{\"mhz\":%lu}]}}",
        (unsigned long)heap, (unsigned long)mhz, (unsigned long)mhz, (unsigned long)mhzLp);
  }
  snprintf(line, sizeof(line), "GW_MON:%s", json);
  gwPrintLn(line);
}

static void handleLine(const char* line) {
  if (strcmp(line, "GW_HELLO") == 0) {
    gwPrintLn("GW_ACK:P4-MIN:1:cdc");
    return;
  }
  if (strcmp(line, "DIGIKEYPING") == 0) {
    gwPrintLn("DIGIKEYPONG");
    return;
  }
  if (strcmp(line, "PING") == 0) {
    gwPrintLn("PONG");
    return;
  }
}

static char lineBuf[192];
static size_t lineLen;
static uint32_t lastGwMonMs;

void setup() {
#if GW_USB_CDC
  USB.manufacturerName("Lumirail");
  USB.productName(GW_USB_PRODUCT);
  USB.serialNumber("1");
  GW_STREAM.begin(115200);
  USB.begin();
  GW_STREAM.setRxBufferSize(4096);
#else
  GW_STREAM.begin(115200);
#endif
  delay(300);
  lineLen = 0;
  lastGwMonMs = 0;
  gwPrintLn("GW_READY:P4-MIN:1");
}

void loop() {
  uint32_t now = millis();
  if (now - lastGwMonMs >= 1000u) {
    lastGwMonMs = now;
    emitGwMon();
  }
  while (GW_STREAM.available() > 0) {
    int c = GW_STREAM.read();
    if (c < 0) break;
    if (c == '\r') continue;
    if (c == '\n') {
      lineBuf[lineLen] = '\0';
      if (lineLen > 0) handleLine(lineBuf);
      lineLen = 0;
      continue;
    }
    if (lineLen + 1 < sizeof(lineBuf)) lineBuf[lineLen++] = (char)c;
    else lineLen = 0;
  }
  delay(1);
}
