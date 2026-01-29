#include "config.h"
#include "storage.h"
#include <LittleFS.h>
#include <Arduino.h>
#include <string.h>

void configRead(uint8_t* out_active, uint8_t* out_sop, uint8_t* out_sot) {
  *out_active = 1;
  *out_sop = 0;
  *out_sot = 0;
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
      }
    }
  }
  f.close();
}

bool configWrite(uint8_t active, uint8_t sop, uint8_t sot) {
  File f = LittleFS.open(CONFIG_FILE, "w");
  if (!f) return false;
  f.print("scene_active:");
  f.print(active);
  f.print(";\r\nSOP:");
  f.print(sop);
  f.print(";\r\nSOT:");
  f.print(sot);
  f.print(";\r\n");
  f.close();
  return true;
}

bool sceneMetaRead(const char* path, uint32_t* out_delay, uint8_t* out_loop) {
  *out_delay = 500;
  *out_loop = 1;
  if (!LittleFS.exists(path)) return true;
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  char ln[96];
  size_t idx = 0;
  while (f.available()) {
    int c = f.read();
    if (c < 0) break;
    if (c == '\r') continue;
    if (c == '\n' || c == ';') {
      if (idx > 0) {
        ln[idx] = '\0';
        const char* colon = strchr(ln, ':');
        if (colon && colon > ln && colon[1]) {
          if (colon - ln == 5 && memcmp(ln, "delay", 5) == 0) {
            uint32_t d = 0;
            for (const char* p = colon + 1; *p >= '0' && *p <= '9'; p++) d = d * 10 + (*p - '0');
            *out_delay = d;
          } else if (colon - ln == 4 && memcmp(ln, "loop", 4) == 0) {
            *out_loop = (colon[1] == 't' || colon[1] == 'T') ? 1 : 0;
          }
        }
        idx = 0;
      }
    } else if (c != ';' && idx < sizeof(ln) - 1) {
      ln[idx++] = (char)c;
    }
  }
  if (idx > 0) {
    ln[idx] = '\0';
    const char* colon = strchr(ln, ':');
    if (colon && colon > ln && colon[1]) {
      if (colon - ln == 5 && memcmp(ln, "delay", 5) == 0) {
        uint32_t d = 0;
        for (const char* p = colon + 1; *p >= '0' && *p <= '9'; p++) d = d * 10 + (*p - '0');
        *out_delay = d;
      } else if (colon - ln == 4 && memcmp(ln, "loop", 4) == 0) {
        *out_loop = (colon[1] == 't' || colon[1] == 'T') ? 1 : 0;
      }
    }
  }
  f.close();
  return true;
}

bool sceneMetaWrite(const char* path, const char* hash64, uint32_t size, uint32_t delay, uint8_t loop) {
  File f = LittleFS.open(path, "w");
  if (!f) return false;
  f.print("HASH:");
  f.print(hash64);
  f.print(";\r\nSIZE:");
  f.print(size);
  f.print(";\r\ndelay:");
  f.print(delay);
  f.print(";\r\nloop:");
  f.print(loop ? "true" : "false");
  f.print(";\r\n");
  f.close();
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
