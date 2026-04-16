#include "config.h"

#if LMS_L1_SD_TEST_MODE

#include "sd_test_mode.h"
#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <FS.h>
#include <stdio.h>

#if LMS_L1_USE_NATIVE_USB
#include <USB.h>
#include <USBCDC.h>
extern USBCDC PcLink;
extern HardwareSerial LogUart;
#else
#include "pc_link.h"
#endif

static SPIClass sdSpi(SD_SPI_BUS);
static bool g_sd_wire_swap;
#if LMS_L1_USE_NATIVE_USB
static bool g_usb_on;
#endif

static void logP(const char* s) {
#if LMS_L1_USE_NATIVE_USB
  LogUart.print(s);
  if (g_usb_on) PcLink.print(s);
#else
  PcLink.print(s);
#endif
}

static void logLn(const char* s) {
#if LMS_L1_USE_NATIVE_USB
  LogUart.println(s);
  if (g_usb_on) PcLink.println(s);
#else
  PcLink.println(s);
#endif
}

static void logFlush(void) {
#if LMS_L1_USE_NATIVE_USB
  LogUart.flush();
  if (g_usb_on) PcLink.flush();
#else
  PcLink.flush();
#endif
}

static void spiAttach(bool swap_miso_mosi) {
  sdSpi.end();
  delay(10);
  pinMode(SD_PIN_CS, OUTPUT);
  digitalWrite(SD_PIN_CS, HIGH);
  delay(10);
  if (swap_miso_mosi)
    sdSpi.begin(SD_PIN_CLK, SD_PIN_MOSI, SD_PIN_MISO, -1);
  else
    sdSpi.begin(SD_PIN_CLK, SD_PIN_MISO, SD_PIN_MOSI, -1);
}

static void sdBusIdleClocks(void) {
  sdSpi.beginTransaction(SPISettings(400000, MSBFIRST, SPI_MODE0));
  digitalWrite(SD_PIN_CS, HIGH);
  for (int i = 0; i < 120; i++) sdSpi.transfer(0xFF);
  sdSpi.endTransaction();
  delay(20);
}

static bool cmd0RawReadNonIdle(SPIClass& spi, char* dump, size_t dumpsz) {
  spi.beginTransaction(SPISettings(250000, MSBFIRST, SPI_MODE0));
  digitalWrite(SD_PIN_CS, HIGH);
  for (int i = 0; i < 20; i++) spi.transfer(0xFF);
  digitalWrite(SD_PIN_CS, LOW);
  spi.transfer(0x40);
  spi.transfer(0x00);
  spi.transfer(0x00);
  spi.transfer(0x00);
  spi.transfer(0x00);
  spi.transfer(0x95);
  size_t pos = 0;
  bool any = false;
  for (int i = 0; i < 18 && pos + 4 < dumpsz; i++) {
    uint8_t r = spi.transfer(0xFF);
    pos += snprintf(dump + pos, dumpsz - pos, "%02X ", r);
    if (r != 0xFF) any = true;
  }
  digitalWrite(SD_PIN_CS, HIGH);
  spi.endTransaction();
  return any;
}

static void runSpiLineProbe(void) {
  char dbuf[96];
  logLn("--- raw CMD0 (250k) ---");
#if LMS_L1_USE_NATIVE_USB
  LogUart.print("bus=");
  LogUart.println((unsigned)SD_SPI_BUS);
#else
  PcLink.print("bus=");
  PcLink.println((unsigned)SD_SPI_BUS);
#endif
  logLn("swap=0");
  spiAttach(false);
  dbuf[0] = 0;
  bool a1 = cmd0RawReadNonIdle(sdSpi, dbuf, sizeof(dbuf));
  logP("bytes ");
  logLn(dbuf);
  logLn(a1 ? "any!=0xFF: yes" : "any!=0xFF: no (MISO likely wrong or no card)");

  logLn("swap=1");
  spiAttach(true);
  dbuf[0] = 0;
  bool a2 = cmd0RawReadNonIdle(sdSpi, dbuf, sizeof(dbuf));
  logP("bytes ");
  logLn(dbuf);
  logLn(a2 ? "any!=0xFF: yes" : "any!=0xFF: no");

#if SD_SWAP_MISO_MOSI
  g_sd_wire_swap = true;
  logLn("SD_SWAP_MISO_MOSI=1 -> mount uses swap");
#else
  if (a1) {
    g_sd_wire_swap = false;
    logLn("wire: use normal MOSI/MISO");
  } else if (a2) {
    g_sd_wire_swap = true;
    logLn("wire: use swapped MOSI/MISO for mount");
  } else {
    g_sd_wire_swap = false;
    logLn("hint: check CLK CS 3V3 GND; try SD_SPI_BUS 1 in sd_pins.h; SDIO needs SD_MMC not SPI");
  }
#endif
  logFlush();
}

static bool sdMountTry(uint32_t hz) {
  char b[56];
  snprintf(b, sizeof(b), "SD.begin try %lu Hz", (unsigned long)hz);
  logLn(b);
  logFlush();
  sdBusIdleClocks();
  return SD.begin(SD_PIN_CS, sdSpi, hz, "/sd", 10, false);
}

static bool sdMountTryFormat(uint32_t hz) {
  char b[72];
  snprintf(b, sizeof(b), "SD.begin try %lu Hz format_if_empty=1", (unsigned long)hz);
  logLn(b);
  logFlush();
  sdBusIdleClocks();
  return SD.begin(SD_PIN_CS, sdSpi, hz, "/sd", 10, true);
}

static void printCardType(uint8_t t) {
  logP("cardType=");
  if (t == CARD_NONE) logLn("NONE");
  else if (t == CARD_MMC) logLn("MMC");
  else if (t == CARD_SD) logLn("SD");
  else if (t == CARD_SDHC) logLn("SDHC");
  else logLn("UNKNOWN");
}

static void listRoot(fs::FS& fs) {
  File root = fs.open("/");
  if (!root || !root.isDirectory()) {
    logLn("listRoot: open failed");
    return;
  }
  File f = root.openNextFile();
  while (f) {
    logP(f.name());
    if (f.isDirectory())
      logLn(" [DIR]");
    else {
      char szline[40];
      snprintf(szline, sizeof(szline), " size=%lu", (unsigned long)f.size());
      logLn(szline);
    }
    f = root.openNextFile();
  }
}

void lmsSdTestSetup(void) {
#if LMS_L1_USE_NATIVE_USB
  g_usb_on = false;
  LogUart.begin(115200, SERIAL_8N1, DBG_UART_RX, DBG_UART_TX);
#else
  PcLink.begin(115200, SERIAL_8N1, PC_UART_RX, PC_UART_TX);
#endif
  delay(200);
  logLn("sd_test: uart0_ok");
  logFlush();

  SD.end();
  delay(100);

#if SD_PIN_CD >= 0
  pinMode(SD_PIN_CD, INPUT);
#if LMS_L1_USE_NATIVE_USB
  LogUart.print("CD gpio");
  LogUart.print(SD_PIN_CD);
  LogUart.print(" raw=");
  LogUart.println(digitalRead(SD_PIN_CD));
#else
  PcLink.print("CD gpio");
  PcLink.print(SD_PIN_CD);
  PcLink.print(" raw=");
  PcLink.println(digitalRead(SD_PIN_CD));
#endif
#else
  logLn("CD disabled");
#endif

#if SD_RAW_PROBE
  runSpiLineProbe();
#else
  g_sd_wire_swap = (SD_SWAP_MISO_MOSI != 0);
  logLn("SD_RAW_PROBE=0 mount first (SD before USB)");
#endif

  spiAttach(g_sd_wire_swap);
  sdBusIdleClocks();
  logLn("spi_begin_ok (mount path)");
  logFlush();

  static const uint32_t try_hz[] = {
    SD_SPI_FREQ_HZ,
    400000U,
    250000U,
    100000U
  };

  bool sd_ok = false;
  uint32_t ok_hz = 0;
  for (size_t i = 0; i < sizeof(try_hz) / sizeof(try_hz[0]); i++) {
    if (sdMountTry(try_hz[i])) {
      sd_ok = true;
      ok_hz = try_hz[i];
      break;
    }
    logLn("SD.begin failed this try");
    SD.end();
    delay(150);
    spiAttach(g_sd_wire_swap);
  }

  if (!sd_ok) {
    logLn("FR 13=no FAT (often exFAT); trying f_mkfs");
    spiAttach(g_sd_wire_swap);
    if (sdMountTryFormat(400000U)) {
      sd_ok = true;
      ok_hz = 400000U;
    } else {
      SD.end();
      delay(100);
      spiAttach(g_sd_wire_swap);
      if (sdMountTryFormat(250000U)) {
        sd_ok = true;
        ok_hz = 250000U;
      } else
        SD.end();
    }
  }

#if LMS_L1_USE_NATIVE_USB
  PcLink.begin(115200);
  USB.begin();
  delay(200);
  g_usb_on = true;
#endif

  logLn("LM-L1-S3 SD_TEST_MODE");
#if LMS_L1_USE_NATIVE_USB
  logLn("USB started after SD init");
#else
  logLn("PC UART (no native USB)");
#endif

  if (!sd_ok) {
    logLn("SD.begin all retries failed");
    logLn("check sd_diskio f_mkfs uses FF_MAX_SS; format FAT32 on PC");
    return;
  }

  char okmsg[56];
  snprintf(okmsg, sizeof(okmsg), "SD.begin ok at %lu Hz", (unsigned long)ok_hz);
  logLn(okmsg);

  uint8_t ct = SD.cardType();
  printCardType(ct);

  uint64_t sz = SD.cardSize();
  char line[48];
  snprintf(line, sizeof(line), "cardSize_bytes=%llu\r\n", (unsigned long long)sz);
  logP(line);

  uint64_t total = SD.totalBytes();
  uint64_t used = SD.usedBytes();
  snprintf(line, sizeof(line), "totalBytes=%llu\r\n", (unsigned long long)total);
  logP(line);
  snprintf(line, sizeof(line), "usedBytes=%llu\r\n", (unsigned long long)used);
  logP(line);

  logLn("--- root ---");
  listRoot(SD);
}

void lmsSdTestLoop(void) {
  delay(5000);
#if SD_PIN_CD >= 0
#if LMS_L1_USE_NATIVE_USB
  logP("CD=");
  LogUart.println(digitalRead(SD_PIN_CD));
  if (g_usb_on) PcLink.println(digitalRead(SD_PIN_CD));
#else
  logP("CD=");
  PcLink.println(digitalRead(SD_PIN_CD));
#endif
#else
  logLn("tick");
#endif
}

#else

#include "sd_test_mode.h"

void lmsSdTestSetup(void) {}

void lmsSdTestLoop(void) {}

#endif
