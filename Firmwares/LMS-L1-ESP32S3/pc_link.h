#ifndef LMS_L1_PC_LINK_H
#define LMS_L1_PC_LINK_H

#include "config.h"
#include <Arduino.h>

#if LMS_L1_USE_NATIVE_USB
#include <USB.h>
#include <USBCDC.h>
extern USBCDC PcLink;
#else
#include <HardwareSerial.h>
extern HardwareSerial PcLink;
#endif

#endif
