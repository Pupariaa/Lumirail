#include <LittleFS.h>

#define SERIAL_BAUD 115200

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(500);
  if (!LittleFS.begin()) {
    Serial.println("LittleFS begin failed");
    return;
  }
  LittleFS.format();
  LittleFS.end();
  if (!LittleFS.begin()) {
    Serial.println("LittleFS rebegin failed");
    return;
  }
  Serial.println("LittleFS erased");
  Dir dir = LittleFS.openDir("/");
  int n = 0;
  while (dir.next()) n++;
  Serial.print("Files: ");
  Serial.println(n);
  LittleFS.end();
}

void loop() {
  delay(10000);
}
