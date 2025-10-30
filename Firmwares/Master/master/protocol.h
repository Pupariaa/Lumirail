#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <Arduino.h>

#define MAX_SLAVES 24
#define BROADCAST_INTERVAL 1000
#define DISCOVERY_TIMEOUT 30000
#define PING_TIMEOUT 1000

enum SlaveState {
  STATE_UNPAIRED,
  STATE_DISCOVERED,
  STATE_PAIRED,
  STATE_LOST
};

enum MessageType {
  MSG_BROADCAST_DISCOVERY = 0x01,
  MSG_STATUS_RESPONSE = 0x02,
  MSG_PING_REQUEST = 0x03,
  MSG_PING_RESPONSE = 0x04,
  MSG_COMMAND = 0x05,
  MSG_ACK = 0x06,
  MSG_NACK = 0x07,
  MSG_PAIR_REQUEST = 0x08,
  MSG_PAIR_RESPONSE = 0x09,
  MSG_UNPAIR = 0x0A,
  MSG_FW_BEGIN = 0x20,
  MSG_FW_CHUNK = 0x21,
  MSG_FW_END = 0x22,
  MSG_FW_ACK = 0x23,
  MSG_FW_ERROR = 0x24
};

struct EspNowMessage {
  uint8_t version;
  MessageType type;
  uint16_t sequence;
  uint8_t payload[200];
  uint8_t payloadLength;
  uint16_t checksum;
};

struct SlaveInfo {
  uint8_t mac[6];
  int32_t rssi;
  uint64_t lastSeen;
  SlaveState state;
  uint8_t linked;
  uint8_t name[16];
} __attribute__((packed));

struct CurrentStats {
  uint8_t pairedCount;
  uint8_t discoveredCount;
  uint32_t messagesSent;
  uint32_t messagesReceived;
  uint32_t messagesLost;
};

uint16_t calculateChecksum(EspNowMessage msg);

#endif

