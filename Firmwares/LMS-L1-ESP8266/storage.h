#ifndef LMS_L1_ESP8266_STORAGE_H
#define LMS_L1_ESP8266_STORAGE_H

#include <stdint.h>
#include <stdbool.h>

void configRead(uint8_t* out_active, uint8_t* out_sop, uint8_t* out_sot);
bool configWrite(uint8_t active, uint8_t sop, uint8_t sot);
bool sceneMetaRead(const char* path, uint32_t* out_delay, uint8_t* out_loop);
bool sceneMetaWrite(const char* path, const char* hash64, uint32_t size, uint32_t delay, uint8_t loop);
void printStorageState(void);

#endif
