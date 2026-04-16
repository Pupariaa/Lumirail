#include "status_leds.h"
#include "config.h"
#include <Arduino.h>
#include <string.h>

static uint32_t last_pong_ms;
static uint32_t flash_toggle_ms;
static uint8_t flash_phase;
static bool was_scene_send;

void status_leds_init(void) {
  pinMode(LED_RUN_PIN, OUTPUT);
  digitalWrite(LED_RUN_PIN, LOW);
  pinMode(LED_MODULE_PIN, OUTPUT);
  digitalWrite(LED_MODULE_PIN, HIGH);
#if LED_AUX_USABLE
  pinMode(LED_AUX_PIN, OUTPUT);
  digitalWrite(LED_AUX_PIN, LOW);
#endif
}

void status_leds_module_rx_byte(uint8_t b) {
  static char line[8];
  static size_t len;
  if (b == '\r') return;
  if (b == '\n') {
    if (len == 4 && memcmp(line, "PONG", 4) == 0) {
      last_pong_ms = millis();
    }
    len = 0;
  } else if (len < sizeof(line) - 1) {
    line[len++] = (char)b;
  }
}

void status_leds_tick(bool scene_send_active) {
  if (scene_send_active) {
    was_scene_send = true;
    uint32_t now = millis();
    if ((uint32_t)(now - flash_toggle_ms) >= (uint32_t)STATUS_LED_FLASH_MS) {
      flash_toggle_ms = now;
      flash_phase ^= 1u;
      digitalWrite(LED_MODULE_PIN, flash_phase ? LOW : HIGH);
    }
    return;
  }
  if (was_scene_send) {
    was_scene_send = false;
    flash_phase = 0;
    flash_toggle_ms = millis();
  }
  bool on = last_pong_ms != 0 && (millis() - last_pong_ms) < (uint32_t)MODULE_LED_PONG_HOLD_MS;
  digitalWrite(LED_MODULE_PIN, on ? LOW : HIGH);
}
