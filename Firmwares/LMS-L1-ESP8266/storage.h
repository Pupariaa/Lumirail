#ifndef LMS_L1_ESP8266_STORAGE_H
#define LMS_L1_ESP8266_STORAGE_H

#include <stdint.h>
#include <stdbool.h>

void configRead(uint8_t* out_active, uint8_t* out_sop, uint8_t* out_sot, uint8_t* out_play_loop);
bool configWrite(uint8_t active, uint8_t sop, uint8_t sot, uint8_t play_loop);
bool copyFile(const char* src, const char* dst);
bool sceneCommit(void);
bool sceneLfpMeta(uint16_t* out_tick_ms, uint32_t* out_frame_count, uint16_t* out_channel_count);
void printStorageState(void);

#endif
