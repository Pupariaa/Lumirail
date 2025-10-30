#include "w25q.h"

#define CMD_READ_STATUS1 0x05
#define CMD_WRITE_ENABLE 0x06
#define CMD_READ_DATA 0x03
#define CMD_PAGE_PROGRAM 0x02
#define CMD_SECTOR_ERASE_4K 0x20
#define CMD_JEDEC_ID 0x9F
#define CMD_READ_UNIQUE_ID 0x4B

W25Q::W25Q(uint8_t csPin, uint8_t mosiPin, uint8_t misoPin, uint8_t sckPin)
  : spi(VSPI), pinCS(csPin), pinMOSI(mosiPin), pinMISO(misoPin), pinSCK(sckPin), present(false), jedecManuf(0), jedecType(0), jedecCapacity(0) {}

bool W25Q::begin() {
  pinMode(pinCS, OUTPUT);
  digitalWrite(pinCS, HIGH);
  spi.begin(pinSCK, pinMISO, pinMOSI, pinCS);
  delay(10);
  uint8_t m, t, c;
  present = readJedecId(m, t, c);
  if (present) {
    jedecManuf = m;
    jedecType = t;
    jedecCapacity = c;
  }
  return present;
}

bool W25Q::isPresent() const { return present; }

void W25Q::select() { digitalWrite(pinCS, LOW); }
void W25Q::deselect() { digitalWrite(pinCS, HIGH); }

bool W25Q::readJedecId(uint8_t &manuf, uint8_t &memType, uint8_t &capacity) {
  select();
  spi.transfer(CMD_JEDEC_ID);
  manuf = spi.transfer(0x00);
  memType = spi.transfer(0x00);
  capacity = spi.transfer(0x00);
  deselect();
  return manuf != 0x00 && manuf != 0xFF;
}

bool W25Q::readUniqueId(uint8_t uid[8]) {
  select();
  spi.transfer(CMD_READ_UNIQUE_ID);
  spi.transfer(0x00);
  spi.transfer(0x00);
  spi.transfer(0x00);
  spi.transfer(0x00);
  for (int i = 0; i < 8; i++) uid[i] = spi.transfer(0x00);
  deselect();
  return true;
}

uint8_t W25Q::readStatus1() {
  select();
  spi.transfer(CMD_READ_STATUS1);
  uint8_t s = spi.transfer(0x00);
  deselect();
  return s;
}

bool W25Q::waitWhileBusy(uint32_t timeoutMs) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    if ((readStatus1() & 0x01) == 0) return true;
    delay(1);
  }
  return false;
}

bool W25Q::writeEnable() {
  select();
  spi.transfer(CMD_WRITE_ENABLE);
  deselect();
  uint32_t start = millis();
  while (millis() - start < 50) {
    if (readStatus1() & 0x02) return true;
    delay(1);
  }
  return false;
}

bool W25Q::readData(uint32_t addr, uint8_t *buf, size_t len) {
  if (!present || buf == nullptr || len == 0) return false;
  select();
  spi.transfer(CMD_READ_DATA);
  spi.transfer((addr >> 16) & 0xFF);
  spi.transfer((addr >> 8) & 0xFF);
  spi.transfer(addr & 0xFF);
  for (size_t i = 0; i < len; i++) buf[i] = spi.transfer(0x00);
  deselect();
  return true;
}

bool W25Q::pageProgram(uint32_t addr, const uint8_t *data, size_t len) {
  if (!present || data == nullptr || len == 0 || len > 256) return false;
  if (!writeEnable()) return false;
  select();
  spi.transfer(CMD_PAGE_PROGRAM);
  spi.transfer((addr >> 16) & 0xFF);
  spi.transfer((addr >> 8) & 0xFF);
  spi.transfer(addr & 0xFF);
  for (size_t i = 0; i < len; i++) spi.transfer(data[i]);
  deselect();
  return waitWhileBusy();
}

bool W25Q::sectorErase4K(uint32_t addr) {
  if (!present) return false;
  if (!writeEnable()) return false;
  select();
  spi.transfer(CMD_SECTOR_ERASE_4K);
  spi.transfer((addr >> 16) & 0xFF);
  spi.transfer((addr >> 8) & 0xFF);
  spi.transfer(addr & 0xFF);
  deselect();
  return waitWhileBusy(8000);
}

bool W25Q::eraseRange(uint32_t addr, size_t len) {
  if (!present || len == 0) return false;
  uint32_t start = addr & ~0xFFFUL;
  uint32_t end = (addr + (uint32_t)len + 0xFFFUL) & ~0xFFFUL;
  for (uint32_t a = start; a < end; a += 4096UL) {
    if (!sectorErase4K(a)) return false;
  }
  return true;
}

bool W25Q::writeRange(uint32_t addr, const uint8_t *data, size_t len, bool verify) {
  if (!present || data == nullptr || len == 0) return false;
  size_t written = 0;
  while (written < len) {
    uint32_t cur = addr + (uint32_t)written;
    uint32_t pageRemain = 256UL - (cur & 0xFFUL);
    size_t remain = len - written;
    size_t chunk = (remain < pageRemain) ? remain : pageRemain;
    if (!pageProgram(cur, data + written, chunk)) return false;
    if (verify) {
      uint8_t tmp[64];
      size_t vleft = chunk;
      size_t vdone = 0;
      while (vleft > 0) {
        size_t take = vleft > sizeof(tmp) ? sizeof(tmp) : vleft;
        if (!readData(cur + vdone, tmp, take)) return false;
        for (size_t i = 0; i < take; i++) {
          if (tmp[i] != data[written + vdone + i]) return false;
        }
        vdone += take;
        vleft -= take;
      }
    }
    written += chunk;
  }
  return true;
}

uint32_t W25Q::sizeBytes() const {
  if (!present) return 0;
  if (jedecCapacity < 32 || jedecCapacity > 32 + 8) return 0;
  return 1UL << jedecCapacity;
}


