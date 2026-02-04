#ifndef LMS_L1_ESP8266_UTILS_H
#define LMS_L1_ESP8266_UTILS_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <LittleFS.h>

uint8_t hexCharToNibble(char c);
bool hexToBytes(const char* hex, size_t hexLen, uint8_t* out, size_t outLen);
uint32_t parseHex32(const char* hex, size_t len);

bool lineIsSyn(const char* lineBuf, size_t lineLen);
bool lineIs(const char* lineBuf, size_t lineLen, const char* s, size_t n);
bool lineIsSceneReady(const char* lineBuf, size_t lineLen);
bool lineStartsWith(const char* lineBuf, size_t lineLen, const char* pfx, size_t pfxLen);
bool lineIsSceneDump(const char* lineBuf, size_t lineLen);

void computeFileSha256(File& f, uint8_t* out32);

#endif
