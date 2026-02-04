#ifndef LUMIRAIL_DIGIKEY_ESP32S3_BRIDGE_UTIL_H
#define LUMIRAIL_DIGIKEY_ESP32S3_BRIDGE_UTIL_H

#include <stdint.h>
#include <stddef.h>
#include <FS.h>

uint32_t bridge_crc32_update(uint32_t crc, const uint8_t* p, size_t n);
uint32_t bridge_crc32_final(uint32_t crc);
void bridge_crc32_to_hex8(uint32_t crc, char* out8);
uint8_t bridge_hex_char_to_nibble(char c);
uint32_t bridge_parse_hex32(const char* hex, size_t len);
bool bridge_compute_file_sha256(File& f, uint8_t* out32);
bool bridge_sha256_start(void);
bool bridge_sha256_update(const uint8_t* buf, size_t len);
bool bridge_sha256_finish(uint8_t* out32);
void bridge_sha256_abort(void);
void bridge_sha256_to_hex64(const uint8_t* h, char* out64);
bool bridge_hex64_to_bytes(const char* hex, uint8_t* out32);

#endif
