# LED Status Animations

**Update rate**: 30ms | **Brightness**: 50%

## Animations

| State | Color | Pattern | Cycle Duration |
|-------|-------|---------|----------------|
| **INIT** | Cyan | Fade in/out | ~3.0s (100 cycles) |
| **IO_ERROR** | Red | Blink | ~0.6s (20 cycles) |
| **COMM_ERROR** | Orange | Pulse | ~1.8s (60 cycles) |
| **WAITING_PAIR** | Blue | Fade in/out | ~2.4s (80 cycles) |
| **PAIRED** | Green | Smooth fade | ~3.6s (120 cycles) |
| **COMMAND_RECEIVED** | White | Flash | ~0.45s (15 cycles) |
| **UNPAIRED** | Orange | Pulse | ~1.8s (60 cycles) |
| **RESETTING** | Rainbow | Color cycle | ~1.2s (40 cycles) |
| **POWER_LOW** | Yellow/Orange | Pulse | ~1.2s (40 cycles) |
| **SHORT_CIRCUIT** | Red | Fast blink | ~0.12s (4 cycles) |
| **OVERCURRENT** | Orange | Pulse | ~0.9s (30 cycles) |
| **TEMP_OVERHEAT_POWER** | Red | Pulse | ~0.9s (30 cycles) |
| **TEMP_OVERHEAT_LED1** | Orange | Pulse | ~0.9s (30 cycles) |
| **TEMP_OVERHEAT_LED2** | Violet | Pulse | ~0.9s (30 cycles) |

## Priority (highest to lowest)

1. TEMP_OVERHEAT_*
2. COMM_ERROR, IO_ERROR
3. OVERCURRENT, SHORT_CIRCUIT, POWER_LOW
4. COMMAND_RECEIVED (temporary flash)
5. RESETTING
6. PAIRED, WAITING_PAIR, UNPAIRED
7. INIT
