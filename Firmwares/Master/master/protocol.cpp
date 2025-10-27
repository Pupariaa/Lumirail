#include "protocol.h"

uint16_t calculateChecksum(EspNowMessage msg) {
  uint16_t sum = 0;
  uint8_t* data = (uint8_t*)&msg;
  
  for (int i = 0; i < offsetof(EspNowMessage, checksum); i++) {
    sum += data[i];
  }
  
  return sum;
}

