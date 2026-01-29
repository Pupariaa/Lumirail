#ifndef LUMIRAIL_DIGIKEY_ESP32S3_BRIDGE_H
#define LUMIRAIL_DIGIKEY_ESP32S3_BRIDGE_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

void usbPrint(const char* s);
void uartSendLine(const char* buf, size_t len);
bool tryQuickAck(const char* lineBuf, size_t lineLen);
void handleLine(const char* lineBuf, size_t lineLen, bool* sceneState, uint32_t* sceneBytesRemaining, uint32_t* sceneBytesLastMs);

#endif
