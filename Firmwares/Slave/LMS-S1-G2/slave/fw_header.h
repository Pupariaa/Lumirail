#pragma once
#include <Arduino.h>

struct FwHeader {
  char magic[4];
  char version[8];
  uint32_t sizeBytes;
  uint32_t crc32;
  uint8_t sha256[32];
  uint8_t reserved[8];
  uint32_t headerCrc32;
} __attribute__((packed));

static inline uint32_t fw_header_crc(const FwHeader &h) {
  const uint8_t *p = reinterpret_cast<const uint8_t *>(&h);
  uint32_t sum = 0;
  for (size_t i = 0; i < sizeof(FwHeader) - sizeof(uint32_t); i++) sum += p[i];
  return sum;
}


