#include "config.h"
#include "storage.h"
#include <LittleFS.h>
#include <Arduino.h>
#include <string.h>

static uint32_t readU16LE(const uint8_t* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8);
}
static uint32_t readU32LE(const uint8_t* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static const char* sceneBinPath(void) {
  return SCENE_BIN;
}
static const char* sceneTmpPath(void) {
  return SCENE_TMP;
}
static const char* sceneBakPath(void) {
  return SCENE_BAK;
}

void configRead(uint8_t* out_active, uint8_t* out_sop, uint8_t* out_sot, uint8_t* out_play_loop) {
  *out_active = 1;
  *out_sop = 0;
  *out_sot = 0;
  *out_play_loop = 1;
  if (!LittleFS.exists(CONFIG_FILE)) return;
  File f = LittleFS.open(CONFIG_FILE, "r");
  if (!f) return;
  char ln[64];
  size_t idx = 0;
  while (f.available() && idx < sizeof(ln) - 1) {
    int c = f.read();
    if (c < 0) break;
    if (c == '\r') continue;
    if (c == '\n') {
      ln[idx] = '\0';
      if (idx > 0) {
        const char* colon = strchr(ln, ':');
        if (colon && colon > ln && colon[1]) {
          if (colon - ln == 12 && memcmp(ln, "scene_active", 12) == 0) {
            *out_active = (colon[1] == '2') ? 2 : 1;
          } else if (colon - ln == 3 && memcmp(ln, "SOP", 3) == 0) {
            *out_sop = (colon[1] == '1') ? 1 : 0;
          } else if (colon - ln == 3 && memcmp(ln, "SOT", 3) == 0) {
            *out_sot = (colon[1] == '1') ? 1 : 0;
          } else if (colon - ln == 9 && memcmp(ln, "play_loop", 9) == 0) {
            *out_play_loop = (colon[1] == 't' || colon[1] == 'T' || colon[1] == '1') ? 1 : 0;
          }
        }
      }
      idx = 0;
    } else {
      ln[idx++] = (char)c;
    }
  }
  if (idx > 0) {
    ln[idx] = '\0';
    const char* colon = strchr(ln, ':');
    if (colon && colon > ln && colon[1]) {
      if (colon - ln == 12 && memcmp(ln, "scene_active", 12) == 0) {
        *out_active = (colon[1] == '2') ? 2 : 1;
      } else if (colon - ln == 3 && memcmp(ln, "SOP", 3) == 0) {
        *out_sop = (colon[1] == '1') ? 1 : 0;
      } else if (colon - ln == 3 && memcmp(ln, "SOT", 3) == 0) {
        *out_sot = (colon[1] == '1') ? 1 : 0;
      } else if (colon - ln == 9 && memcmp(ln, "play_loop", 9) == 0) {
        *out_play_loop = (colon[1] == 't' || colon[1] == 'T' || colon[1] == '1') ? 1 : 0;
      }
    }
  }
  f.close();
}

bool configWrite(uint8_t active, uint8_t sop, uint8_t sot, uint8_t play_loop) {
  File f = LittleFS.open(CONFIG_FILE, "w");
  if (!f) return false;
  f.print("scene_active:");
  f.print(active);
  f.print(";\r\nSOP:");
  f.print(sop);
  f.print(";\r\nSOT:");
  f.print(sot);
  f.print(";\r\nplay_loop:");
  f.print(play_loop ? "true" : "false");
  f.print(";\r\n");
  f.close();
  return true;
}

bool copyFile(const char* src, const char* dst) {
  if (!LittleFS.exists(src)) return false;
  File s = LittleFS.open(src, "r");
  if (!s) return false;
  File d = LittleFS.open(dst, "w");
  if (!d) {
    s.close();
    return false;
  }
  uint8_t buf[128];
  while (s.available()) {
    size_t n = s.read(buf, sizeof(buf));
    if (n == 0) break;
    if (d.write(buf, n) != (int)n) {
      s.close();
      d.close();
      LittleFS.remove(dst);
      return false;
    }
  }
  s.close();
  d.close();
  return true;
}

bool sceneCommit(void) {
  const char* tmp = sceneTmpPath();
  const char* bin = sceneBinPath();
  const char* bak = sceneBakPath();
  if (!LittleFS.exists(tmp)) return false;
  if (LittleFS.exists(bin)) {
    if (LittleFS.exists(bak)) LittleFS.remove(bak);
    if (!copyFile(bin, bak)) return false;
    LittleFS.remove(bin);
  }
  if (!copyFile(tmp, bin)) return false;
  LittleFS.remove(tmp);
  return true;
}

bool sceneLfpMeta(uint16_t* out_tick_ms, uint32_t* out_frame_count, uint16_t* out_channel_count) {
  *out_tick_ms = 0;
  *out_frame_count = 0;
  *out_channel_count = 0;
  const char* path = sceneBinPath();
  if (!LittleFS.exists(path)) return false;
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  if (f.size() < 32) {
    f.close();
    return false;
  }
  uint8_t header[32];
  if (f.read(header, 32) != 32) {
    f.close();
    return false;
  }
  f.close();
  if (readU32LE(header + 0) != LFP_MAGIC) return false;
  *out_tick_ms = (uint16_t)readU16LE(header + 12);
  *out_channel_count = (uint16_t)readU16LE(header + 14);
  *out_frame_count = readU32LE(header + 16);
  return true;
}

void printStorageState(void) {
  Dir dir = LittleFS.openDir("/");
  Serial.println("LittleFS:");
  while (dir.next()) {
    Serial.print("  ");
    Serial.print(dir.fileName());
    Serial.print(" ");
    Serial.println(dir.fileSize());
  }
}
