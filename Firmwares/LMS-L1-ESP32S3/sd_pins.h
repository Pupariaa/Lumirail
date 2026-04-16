#ifndef LMS_L1_ESP32S3_SD_PINS_H
#define LMS_L1_ESP32S3_SD_PINS_H

#define SD_PIN_CS 7
#define SD_PIN_MOSI 17
#define SD_PIN_MISO 16
#define SD_PIN_CLK 15
#define SD_PIN_CD (-1)
#define SD_SPI_FREQ_HZ 1000000U

#ifndef SD_SPI_BUS
#define SD_SPI_BUS 0
#endif

#endif
