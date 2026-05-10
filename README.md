# Lumirail - Global Project README

This README centralizes the current gateway architecture decisions for the ESP32-P4 generation, including variants, firmware split, CH552 roles, CAN throughput strategy, and differential scene updates.

## 1. Gateway vision

The gateway is the central brain of the Lumirail system.

- Main compute: ESP32-P4
- Studio must access the gateway directly
- Gateway-to-Studio transports: USB-C always, Ethernet on Plus and Pro
- Gateway also orchestrates LMS cards behind CAN networks

## 2. Gateway variants

### Standard

- 1x USB Type-C (Studio link)
- 1x physical CAN link
- 1x USB Type-A

### Plus

- 1x USB Type-C (Studio link)
- 2x physical CAN links
- 1x USB Type-A
- 1x RJ45 Ethernet (Studio link)
- 1x DCC 12V physical link

### Pro

- 1x USB Type-C (Studio link)
- 3x physical CAN links
- 1x USB Type-A
- 1x RJ45 Ethernet (Studio link)
- 2x DCC 12V physical links

## 3. CAN architecture (duplex per physical link)

Each physical CAN link is internally treated as 2 logical CAN buses in parallel to increase effective throughput.

- 1 physical link = 2 logical CAN buses
- Standard: 1 physical link -> 2 logical buses
- Plus: 2 physical links -> 4 logical buses
- Pro: 3 physical links -> 6 logical buses

### ESP32-P4 native TWAI allocation

- First physical CAN link (all variants): TWAI1 for bus0 + TWAI2 for bus1
- Additional physical links (Plus/Pro): implemented via SPI CAN controllers
- Pro uses two SPI groups for the extra two physical links (4 extra logical buses)

## 4. Gateway firmware split (ESP32-P4)

Three gateway firmware builds are planned:

- `GW-P4-STD` for Standard
- `GW-P4-PLUS` for Plus
- `GW-P4-PRO` for Pro

Most code is shared. The hardware topology and enabled drivers differ by variant.

### Minimal USB CDC bring-up (bare P4)

Sketch path: `Firmwares/Gateway-P4/GW-P4-UsbMinimal/GW-P4-UsbMinimal.ino`.

Uses TinyUSB CDC ACM when `USBCDC.h` exists (ESP32 Arduino cores that expose native USB). Otherwise falls back to `Serial` for UART-only boards.

Boot line: `GW_READY:P4-MIN:1`. Commands: `GW_HELLO` -> `GW_ACK:...`, `DIGIKEYPING` -> `DIGIKEYPONG`, `PING` -> `PONG`.

Lumirail Studio probes `GW_HELLO` after connect; if it sees `GW_ACK`, it treats the device as gateway firmware and skips LMS module scan.

USB-A mass storage: the gateway hosts a USB flash drive with raw scenes and project export; Studio can prefer this archive over local storage when `GW_USB:1` is announced (`gateway_usb` preference). See `Software/Application/Lumirail Studio/docs/architecture-notes.md`.

## 5. Auxiliary firmwares (CH552, not CH32)

The gateway uses dedicated CH552 microcontrollers for peripheral control roles.

| Role | Proposed firmware name | Short name |
|---|---|---|
| ESP32-P4 power supervision | `P4-POWER-CTRL` | `P4-PWR` |
| ESP32-P4 thermal control | `P4-THERMAL-CTRL` | `P4-THM` |
| CAN termination control | `P4-CAN-TERM-CTRL` | `P4-CANTERM` |
| Buttons + status LEDs | `P4-IO-STATUS-CTRL` | `P4-IOSTAT` |
| Front display management | `P4-FRONT-DISPLAY-CTRL` | `P4-FDISP` |

## 6. CH552 pin map

### Common to all CH552 firmwares

- UART RX: `P3.0`
- UART TX: `P3.1`
- I2C SDA: `P1.6`
- I2C SCL: `P1.7`

### P4-IO-STATUS-CTRL specific pins

- `P3.3`: OK button
- `P1.1`: Back button
- `P1.0`: Next button
- `P3.2`: Boot LED
- `P1.4`: Error LED
- `P1.5`: Activity LED

### P4-CAN-TERM-CTRL specific pins

- `TERM_1_CMD`: `P3.3`
- `TERM_2_CMD`: `P1.1`
- `TERM_3_CMD`: `P3.4`
- `TERM_4_CMD`: `P1.5`
- `TERM_5_CMD`: `P3.2`
- `TERM_6_CMD`: `P1.6`

Important: `TERM_6_CMD` on `P1.6` conflicts with common I2C SDA (`P1.6`). This must be resolved at hardware definition level.

## 7. Studio access to gateway

The Studio app must address gateway services directly (not only LMS pass-through):

- Gateway identification (variant, serial, versions)
- Port and feature inventory (CAN, Ethernet, DCC, USB host)
- CAN line/logic status and configuration
- CH552 peripheral status (PWR, THM, IOSTAT, CANTERM, FDISP)
- Existing LMS transport protocol support (`SCENE_*`) through gateway routing

## 8. CAN bonding strategy (2 buses as one)

To use two logical CAN buses as one high-throughput channel:

1. Split payload stream into fragments with sequence numbering
2. Dispatch fragments over bus A and bus B using weighted round-robin
3. Reorder and reassemble on receiver side using a bounded window
4. Monitor each bus health and degrade to single-bus mode on failure
5. Restore dual-bus mode when healthy again

Expected outcomes:

- Higher effective throughput
- Lower head-of-line blocking
- Graceful failover if one bus degrades

## 9. Differential scene update (hash + checksum)

Goal: send only changed LED states instead of re-uploading full scene when small edits occur.

### Integrity levels

- Full scene hash: SHA-256 for final exact match validation
- Block checksum/hash: detect changed blocks quickly
- Channel/column hash: detect channels changed across many frames

### Recommended flow

1. Compare remote vs local scene manifest
2. If identical hash -> no upload
3. If close match -> send only changed blocks (CRC verified)
4. If sparse channel changes across full timeline -> send changed columns only
5. Final full SHA-256 verification before commit
6. Atomic commit/rollback on target LMS card

This keeps reliability while minimizing transfer size and update time.

## 10. Notes on USB-A and DCC

- USB-A role is still open (storage import/export, HID panel, external serial peripheral, etc.)
- DCC links are physical outputs on Plus/Pro and should be exposed in the gateway capability model

## 11. Current status

This document defines architecture and protocol direction. Firmware implementation details are to be aligned to this baseline as hardware constraints are finalized.
