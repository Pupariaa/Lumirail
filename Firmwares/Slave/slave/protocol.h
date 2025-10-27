#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <Arduino.h>

#define STATUS_INTERVAL 2000
#define PING_TIMEOUT 5000
#define MASTER_TIMEOUT 10000

enum SlaveState {
  STATE_UNPAIRED,
  STATE_DISCOVERED,
  STATE_LINKED
};

enum MessageType {
  MSG_BROADCAST_DISCOVERY = 0x01,
  MSG_STATUS_RESPONSE = 0x02,
  MSG_PING_REQUEST = 0x03,
  MSG_PING_RESPONSE = 0x04,
  MSG_COMMAND = 0x05,
  MSG_ACK = 0x06,
  MSG_NACK = 0x07
};

struct EspNowMessage {
  uint8_t version;
  MessageType type;
  uint16_t sequence;
  uint8_t payload[200];
  uint8_t payloadLength;
  uint16_t checksum;
};

uint16_t calculateChecksum(EspNowMessage msg);

#endif

