#ifndef LUMIRAIL_DIGIKEY_ESP32S3_BRIDGE_H
#define LUMIRAIL_DIGIKEY_ESP32S3_BRIDGE_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

void moduleTxReset(void);
bool moduleTxAppend(const uint8_t* data, size_t len);
bool moduleTxAppendStr(const char* s);
size_t moduleTxPending(void);

void bridge_set_usb_output(void (*fn)(const char*));
void usbPrint(const char* s);
bool tryQuickAck(const char* lineBuf, size_t lineLen);
void handleLine(const char* lineBuf, size_t lineLen, bool* sceneState, uint32_t* sceneBytesRemaining,
    uint32_t* sceneLfpSize, uint32_t* sceneSendToModuleLfpSize, char* sceneSendToModuleHash);

void bridgeSendSceneStart(uint32_t lfpSize);
void bridgeSendSceneBlockLine(uint32_t idx, uint32_t len, const char* crcHex);
void bridgeSendSceneHashBinary(const uint8_t* hash32);
bool bridgeDrainModuleTxOne(void);
void bridgeDrainModuleTx(size_t maxBytes);

#endif
