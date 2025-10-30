#pragma once
#include <Arduino.h>

uint32_t crc32_init();
uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t len);
uint32_t crc32_finalize(uint32_t crc);


