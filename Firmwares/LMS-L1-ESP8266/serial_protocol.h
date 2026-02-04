#ifndef LMS_L1_ESP8266_SERIAL_PROTOCOL_H
#define LMS_L1_ESP8266_SERIAL_PROTOCOL_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

void sendLine(const char* s);
bool waitForLineAck(const char* ack, size_t ackLen);
void sendFileLinesWithHash(const char* path, const char* endPrefix, const char* lineAck, size_t lineAckLen);
void sendFileBlock(const char* path, const char* endPrefix);
void sendSceneMetaBlock(const char* endPrefix);
void sendFileText(const char* path, const char* errLine, const char* endLine);
void dumpSceneFile(const char* path);
void debugRxHex(const char* buf, size_t n);

#endif
