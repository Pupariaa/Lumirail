# CH32 peripheral firmwares

The ESP32-P4 mainboard delegates a few real-time, low-level or chassis
specific tasks to small CH32 microcontrollers. Each CH32 chip runs exactly
one firmware. The P4 talks to all of them over a shared I2C bus and a
dedicated UART per chip (used for boot logs and recovery commands).

## 1. Roles

| Role                                          | Firmware name           | Short      |
|-----------------------------------------------|-------------------------|------------|
| ESP32-P4 mainboard power supervision          | P4-POWER-CTRL           | P4-PWR     |
| ESP32-P4 mainboard thermal control            | P4-THERMAL-CTRL         | P4-THM     |
| CAN bus line terminator switching             | P4-CAN-TERM-CTRL        | P4-CANTERM |
| Buttons and status LEDs (front panel)         | P4-IO-STATUS-CTRL       | P4-IOSTAT  |
| Front display driver                          | P4-FRONT-DISPLAY-CTRL   | P4-FDISP   |

The short names are the ones used in firmware identification strings, in
the gateway management protocol (`GW_INFO` reports them), and in board
silkscreen labels.

## 2. Common pin map

These pins have the same meaning on every CH32 chip in the gateway. A
firmware that does not need a given function leaves the pin unconfigured
(input, no pull) so it can be probed safely.

| Pin   | Function | Direction | Notes                                  |
|-------|----------|-----------|----------------------------------------|
| P3.0  | UART RX  | input     | From P4 TX                             |
| P3.1  | UART TX  | output    | To P4 RX (boot logs, recovery shell)   |
| P1.6  | I2C SDA  | bi-dir    | Shared bus, P4 is master               |
| P1.7  | I2C SCL  | input     | Shared bus, P4 is master               |

The UART runs at 115200 8N1 in normal operation; 9600 in recovery mode.

The I2C bus runs at 400 kHz. Each CH32 chip has a unique 7-bit address.
Addresses are assigned at provisioning time and stored in the CH32 flash
config page.

## 3. P4-IO-STATUS-CTRL (P4-IOSTAT)

Drives the three front-panel buttons and three status LEDs. Reports button
events to the P4 over I2C (level + edge timestamp) and accepts LED state
commands from the P4.

| Pin   | Function          | Direction | Notes                              |
|-------|-------------------|-----------|------------------------------------|
| P3.3  | OK button         | input     | Active low, internal pull-up       |
| P1.1  | Back button       | input     | Active low, internal pull-up       |
| P1.0  | Next button       | input     | Active low, internal pull-up       |
| P3.2  | Boot LED          | output    | High = lit                         |
| P1.4  | Error LED         | output    | High = lit                         |
| P1.5  | Activity LED      | output    | High = lit                         |

Behaviour:

- During normal operation, the LEDs reflect the state pushed by the P4.
- If the I2C link to the P4 is silent for more than 2 s, the firmware
  switches to a self-driven heartbeat (Activity LED slow blink) so that
  it is visible the chassis is alive even if the P4 is stuck.

## 4. P4-CAN-TERM-CTRL (P4-CANTERM)

Switches the 120 ohm termination resistors on each end of every CAN line.
The Pro variant has up to 6 logical CAN buses, hence 6 termination
commands.

| Pin   | Signal      | Direction | Notes                              |
|-------|-------------|-----------|------------------------------------|
| P3.3  | TERM_1_CMD  | output    | High = termination on              |
| P1.1  | TERM_2_CMD  | output    | High = termination on              |
| P3.4  | TERM_3_CMD  | output    | High = termination on              |
| P1.5  | TERM_4_CMD  | output    | High = termination on              |
| P3.2  | TERM_5_CMD  | output    | High = termination on              |
| P1.6  | TERM_6_CMD  | output    | High = termination on              |

### 4.1 Pin allocation conflict to resolve

The shared I2C SDA pin is also P1.6, which is reused as `TERM_6_CMD` in
the table above. This is not viable on the same chip; one of the two
options must be picked before the schematic is locked:

1. Move `TERM_6_CMD` to a free pin (e.g. P1.2 or P3.5).
2. Drop the I2C link on this CH32 and move it to UART-only management
   (less convenient for the P4 but possible since CANTERM commands are
   infrequent).

Option 1 is recommended; this document will be updated once the new pin
is chosen.

## 5. P4-POWER-CTRL (P4-PWR)

Watches the mainboard rails (3V3, 5V, 12V if present) through the CH32
ADC, controls the P4 enable line, and reports brown-out events to the P4.
Pin map will be detailed when the schematic is locked. The common pins
(UART, I2C) apply.

## 6. P4-THERMAL-CTRL (P4-THM)

Reads one or more thermistors on the mainboard, drives the chassis fan
(if any), and reports temperature thresholds. The P4 may consult it
through I2C, but the firmware enforces an autonomous thermal cut-off
that does not need the P4 to be alive.

## 7. P4-FRONT-DISPLAY-CTRL (P4-FDISP)

Drives the front-panel display (likely an SPI ST77xx or similar). Receives
either pixel updates from the P4 (full bitmap or rect) or higher-level
status frames (variant icons, current scene, network status). The exact
display peripheral is defined in the schematic; the firmware abstracts
the panel behind a small command set.

## 8. Boot and recovery

Each CH32 firmware exposes the same recovery shell on its UART (P3.0/P3.1)
when held in recovery mode (button or strap, decided per chip). The shell
allows:

- Reading the firmware short name and version (`id`).
- Reading the I2C address (`addr`).
- Forcing safe defaults (`safe`).
- Triggering an in-place re-flash from the P4 (`updt`).

This is the only path used by the P4 to update CH32 firmwares without
opening the chassis.
