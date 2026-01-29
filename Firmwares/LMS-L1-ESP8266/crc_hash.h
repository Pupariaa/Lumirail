#ifndef LMS_L1_ESP8266_CRC_HASH_H
#define LMS_L1_ESP8266_CRC_HASH_H

#include <stdint.h>
#include <stddef.h>

void crc32_init(void);
uint32_t crc32_update(uint32_t crc, const uint8_t* p, size_t n);
uint32_t crc32_final(uint32_t crc);
void crc32_to_hex8(uint32_t crc, char* out8);
void sha256_hex(const uint8_t* h, char* out64);

extern const char hexTab[17];

#endif
