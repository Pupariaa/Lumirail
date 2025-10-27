#ifndef SERIAL_COMMANDS_H
#define SERIAL_COMMANDS_H

#include <Arduino.h>

class SerialCommands {
public:
  SerialCommands();
  void init();
  void process();
  
private:
  void handleCommand(const String& cmd);
};

extern SerialCommands serialCommands;

#endif

