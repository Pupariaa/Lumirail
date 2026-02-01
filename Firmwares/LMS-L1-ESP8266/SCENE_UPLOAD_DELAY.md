# Why delay:200 in scene_metadata makes upload "stop responding"

The delay in scene_metadata_1/2.txt is **not** used by the ESP8266 during upload. The firmware never reads that value while in sceneState == 1 (receiving scene lines). So the link is indirect: **the host (web app) uses the delay value to throttle the upload**.

## Chain

1. Before upload the host does GETCONFIG and receives the metadata (including `delay:200` or `delay:500`).
2. During upload the host sends scene data in chunks. If the host uses `delay` as the **inter-chunk delay** (wait `delay` ms between chunks), then:
   - delay:500 → chunk every 500 ms → ~2 chunks/s
   - delay:200 → chunk every 200 ms → ~5 chunks/s
3. So with delay:200 the host sends **faster**. The ESP8266 then receives more bytes per second and sends more `FRAME_RECV:XXXXXX` per second.

## Why the ESP8266 stops responding

In sceneState == 1, for **each** scene line the ESP8266 does:

- `sceneFile.write(...)`
- `Serial.print("FRAME_RECV:XXXXXX\r\n")`
- **`Serial.flush()`**  ← blocks until the UART TX buffer is sent

While blocked in `Serial.flush()`, the ESP8266 **does not read** from Serial. Incoming scene data keeps arriving (from bridge → UART). The ESP8266 UART RX buffer is small (on the order of 128–256 bytes). If the host sends fast (delay:200), data arrives faster than we can process it when we block in flush. The RX buffer overflows: bytes are dropped, the stream gets out of sync, and the module can appear to “stop responding” (stuck in flush, or corrupted line state).

With delay:500 the host sends slower, so there is more time between chunks and the RX buffer does not fill up during flush.

So: **delay in metadata → host uses it to pace upload → delay:200 = faster send → back pressure → ESP8266 blocks in flush → RX overflow → desync / no response.**

## Fixes

1. **Web app**: If upload uses metadata `delay` as inter-chunk delay, use a **minimum** (e.g. `Math.max(delay, 400)`) so the host never sends faster than the chain can drain.
2. **ESP8266**: Do **not** block in `Serial.flush()` after every `FRAME_RECV`. Either remove that flush or flush only every N frames so the main loop keeps reading from Serial and the RX buffer does not overflow.
