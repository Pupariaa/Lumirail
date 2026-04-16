#include "config.h"

#if !LMS_L1_SD_TEST_MODE

#include "sd_card.h"
#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <stdio.h>

static SPIClass s_sdSpi(SD_SPI_BUS);
static bool s_sdMounted;
static bool s_sdFmt;

static void spiAttach(bool swap_miso_mosi) {
  s_sdSpi.end();
  delay(10);
  pinMode(SD_PIN_CS, OUTPUT);
  digitalWrite(SD_PIN_CS, HIGH);
  delay(10);
  if (swap_miso_mosi)
    s_sdSpi.begin(SD_PIN_CLK, SD_PIN_MOSI, SD_PIN_MISO, -1);
  else
    s_sdSpi.begin(SD_PIN_CLK, SD_PIN_MISO, SD_PIN_MOSI, -1);
}

static void sdBusIdleClocks(void) {
  s_sdSpi.beginTransaction(SPISettings(400000, MSBFIRST, SPI_MODE0));
  digitalWrite(SD_PIN_CS, HIGH);
  for (int i = 0; i < 120; i++) s_sdSpi.transfer(0xFF);
  s_sdSpi.endTransaction();
  delay(20);
}

static bool tryBegin(uint32_t hz, bool fmt) {
  sdBusIdleClocks();
  return SD.begin(SD_PIN_CS, s_sdSpi, hz, "/sd", 10, fmt);
}

bool lmsSdMount(void) {
  s_sdMounted = false;
  s_sdFmt = false;
  const bool wireSwap = (SD_SWAP_MISO_MOSI != 0);
  spiAttach(wireSwap);
  sdBusIdleClocks();

  static const uint32_t try_hz[] = {
    SD_SPI_FREQ_HZ,
    400000U,
    250000U,
    100000U
  };

  for (size_t i = 0; i < sizeof(try_hz) / sizeof(try_hz[0]); i++) {
    if (tryBegin(try_hz[i], false)) {
      s_sdMounted = true;
      return true;
    }
    SD.end();
    delay(150);
    spiAttach(wireSwap);
  }

  spiAttach(wireSwap);
  if (tryBegin(400000U, true)) {
    s_sdMounted = true;
    s_sdFmt = true;
    return true;
  }
  SD.end();
  return false;
}

bool lmsSdIsMounted(void) {
  return s_sdMounted;
}

void lmsSdUnmount(void) {
  if (s_sdMounted) {
    SD.end();
    s_sdMounted = false;
    s_sdFmt = false;
  }
}

bool lmsSdMountedWithFormat(void) {
  return s_sdMounted && s_sdFmt;
}

#else

#include "sd_card.h"

bool lmsSdMount(void) {
  return false;
}

bool lmsSdIsMounted(void) {
  return false;
}

void lmsSdUnmount(void) {}

bool lmsSdMountedWithFormat(void) {
  return false;
}

#endif
