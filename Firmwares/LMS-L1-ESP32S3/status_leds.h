#ifndef LUMIRAIL_DIGIKEY_ESP32S3_STATUS_LEDS_H
#define LUMIRAIL_DIGIKEY_ESP32S3_STATUS_LEDS_H

#include <stdint.h>
#include <stdbool.h>

void status_leds_init(void);
void status_leds_module_rx_byte(uint8_t b);
void status_leds_tick(bool scene_send_active);

#endif
