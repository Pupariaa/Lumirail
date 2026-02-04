#ifndef LMS_L1_ESP8266_LFP_READER_H
#define LMS_L1_ESP8266_LFP_READER_H

#include <stdint.h>
#include <stddef.h>
#include <FS.h>

typedef struct {
  uint16_t tick_ms;
  uint16_t channel_count;
  uint32_t frame_count;
  uint32_t fram_offset;
} lfp_playback_t;

bool lfpVerifyAndParse(File& f, lfp_playback_t* out);
bool lfpReadFrame(File& f, const lfp_playback_t* info, uint32_t frame_index, uint8_t* buf, size_t buf_len);

#endif
