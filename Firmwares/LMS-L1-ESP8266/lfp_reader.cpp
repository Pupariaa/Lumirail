#include "config.h"
#include "lfp_reader.h"
#include "crc_hash.h"
#include <LittleFS.h>
#include <Arduino.h>
#include <string.h>

static uint32_t readU16LE(const uint8_t* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8);
}

static uint32_t readU32LE(const uint8_t* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static uint32_t crc32FileRegion(File& f, uint32_t offset, uint32_t len) {
  uint32_t crc = 0xffffffffUL;
  uint8_t buf[64];
  f.seek(offset, SeekSet);
  while (len > 0) {
    size_t n = len < sizeof(buf) ? (size_t)len : sizeof(buf);
    if (f.read(buf, n) != n) return 0;
    crc = crc32_update(crc, buf, n);
    len -= (uint32_t)n;
  }
  return crc32_final(crc);
}

bool lfpVerifyAndParse(File& f, lfp_playback_t* out) {
  if (!out) return false;
  memset(out, 0, sizeof(lfp_playback_t));
  if (f.size() < 32) return false;

  uint8_t header[32];
  f.seek(0, SeekSet);
  if (f.read(header, 32) != 32) return false;

  if (readU32LE(header + 0) != LFP_MAGIC) return false;
  if (readU16LE(header + 6) < 32) return false;

  uint32_t dir_offset = readU32LE(header + 20);
  uint32_t dir_len = readU32LE(header + 24);
  if (dir_len > LFP_MAX_DIR_LEN || dir_len < 12) return false;
  if (f.size() < dir_offset + dir_len) return false;

  uint32_t stored_header_crc = readU32LE(header + 28);
  header[28] = 0;
  header[29] = 0;
  header[30] = 0;
  header[31] = 0;
  uint32_t crc = 0xffffffffUL;
  crc = crc32_update(crc, header, 32);
  crc = crc32_final(crc);
  if (crc != stored_header_crc) return false;

  uint16_t tick_ms = (uint16_t)readU16LE(header + 12);
  uint16_t channel_count = (uint16_t)readU16LE(header + 14);
  uint32_t frame_count = readU32LE(header + 16);

  uint8_t* dir_buf = (uint8_t*)malloc(dir_len);
  if (!dir_buf) return false;
  f.seek(dir_offset, SeekSet);
  if (f.read(dir_buf, dir_len) != dir_len) {
    free(dir_buf);
    return false;
  }

  if (readU32LE(dir_buf + 0) != LFP_DIR_MAGIC) {
    free(dir_buf);
    return false;
  }

  uint32_t stored_dir_crc = readU32LE(dir_buf + 8);
  dir_buf[8] = 0;
  dir_buf[9] = 0;
  dir_buf[10] = 0;
  dir_buf[11] = 0;
  crc = 0xffffffffUL;
  crc = crc32_update(crc, dir_buf, dir_len);
  crc = crc32_final(crc);
  if (crc != stored_dir_crc) {
    free(dir_buf);
    return false;
  }

  uint32_t entry_count = readU32LE(dir_buf + 4);
  uint32_t fram_offset = 0;
  bool found_fram = false;

  for (uint32_t i = 0; i < entry_count; i++) {
    size_t e = 12 + i * 20;
    if (e + 20 > dir_len) break;
    uint32_t chunk_type = readU32LE(dir_buf + e + 0);
    if (chunk_type != LFP_CHUNK_FRAM) continue;
    uint32_t off = readU32LE(dir_buf + e + 8);
    uint32_t len = readU32LE(dir_buf + e + 12);
    uint32_t payload_crc = readU32LE(dir_buf + e + 16);
    if (off + len > f.size()) continue;
    if (len != frame_count * (uint32_t)channel_count) continue;
    uint32_t computed = crc32FileRegion(f, off, len);
    if (computed != payload_crc) continue;
    fram_offset = off;
    found_fram = true;
    break;
  }
  free(dir_buf);
  if (!found_fram) return false;

  out->tick_ms = tick_ms;
  out->channel_count = channel_count;
  out->frame_count = frame_count;
  out->fram_offset = fram_offset;
  return true;
}

bool lfpReadFrame(File& f, const lfp_playback_t* info, uint32_t frame_index, uint8_t* buf, size_t buf_len) {
  if (!info || !buf || buf_len < (size_t)info->channel_count) return false;
  if (frame_index >= info->frame_count) return false;
  uint32_t pos = info->fram_offset + frame_index * (uint32_t)info->channel_count;
  f.seek(pos, SeekSet);
  return f.read(buf, info->channel_count) == (int)info->channel_count;
}
