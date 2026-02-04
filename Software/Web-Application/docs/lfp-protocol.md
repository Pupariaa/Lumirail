# LFP – LumiRail Frame Package

Protocol for reading and verifying a ready-to-play scene binary (LFP). All multi-byte integers are **little-endian**.

---

## 1. File layout (high level)

```
[HEADER] 32 bytes, fixed
[CHUNK PAYLOADS] variable (positions given by directory)
[DIRECTORY] at offset DIR_OFFSET, length DIR_LEN
```

The directory is always at the end of the file. Chunk payloads (e.g. FRAMES) are placed between header and directory; their offsets and lengths are stored in the directory.

---

## 2. Header (32 bytes)

Read from offset 0. Layout:

| Offset | Size | Type   | Field         | Description |
|--------|------|--------|---------------|-------------|
| 0      | 4    | bytes  | MAGIC         | Must be `4C 46 50 31` ("LFP1" ASCII) |
| 4      | 2    | u16    | CONTAINER_VER | Container format version (e.g. 1) |
| 6      | 2    | u16    | HEADER_LEN    | Header length in bytes (32) |
| 8      | 4    | u32    | FLAGS         | Bitfield (reserved; 0 for now) |
| 12     | 2    | u16    | TICK_MS       | Frame duration in ms (e.g. 200) |
| 14     | 2    | u16    | CHANNEL_COUNT | Total channels (On/Off + PWM) |
| 16     | 4    | u32    | FRAME_COUNT   | Number of frames |
| 20     | 4    | u32    | DIR_OFFSET    | File offset of the directory |
| 24     | 4    | u32    | DIR_LEN       | Directory size in bytes |
| 28     | 4    | u32    | HEADER_CRC32  | CRC32 of bytes 0–27 (this field set to 0) |

### 2.1 Verifying the header

1. Check `MAGIC == 0x3150464C` (u32 LE) or bytes `4C 46 50 31`.
2. If `CONTAINER_VER` is unsupported, reject or ignore unknown fields.
3. Check `HEADER_LEN >= 32` (and that file size allows reading up to `DIR_OFFSET + DIR_LEN`).
4. **Header CRC32**: build a 32-byte buffer equal to the header, but set bytes 28–31 to `00 00 00 00`. Compute CRC32 (see section 5) over this 32-byte buffer. It must equal the value stored at offset 28. If not, the file is corrupted or invalid.

---

## 3. Directory

Starts at file offset `DIR_OFFSET`, length `DIR_LEN`.

### 3.1 Directory header

| Offset (from dir start) | Size | Type | Field       | Description |
|------------------------|------|------|-------------|-------------|
| 0                      | 4    | bytes| DIR_MAGIC   | Must be `44 49 52 31` ("DIR1" ASCII) |
| 4                      | 4    | u32  | ENTRY_COUNT | Number of chunk entries |
| 8                      | 4    | u32  | DIR_CRC32   | CRC32 of directory with this field set to 0 |

### 3.2 Directory entries (each 20 bytes)

For each `i` in `0 .. ENTRY_COUNT-1`, entry starts at `DIR_OFFSET + 12 + i*20`.

| Offset (in entry) | Size | Type | Field      | Description |
|-------------------|------|------|------------|-------------|
| 0                 | 4    | u32  | CHUNK_TYPE | FourCC-style (e.g. 0x4D415246 = "FRAM") |
| 4                 | 2    | u16  | CHUNK_VER  | Chunk format version |
| 6                 | 2    | u16  | CHUNK_FLAGS| Mode/flags (0 = RAW for FRAMES) |
| 8                 | 4    | u32  | OFFSET     | File offset of chunk payload |
| 12                | 4    | u32  | LEN        | Payload length in bytes |
| 16                | 4    | u32  | CRC32      | CRC32 of the payload (bytes [OFFSET, OFFSET+LEN)) |

### 3.3 Verifying the directory

1. Check `DIR_MAGIC == 0x31524944` (u32 LE) or bytes `44 49 52 31`.
2. Build a buffer of length `DIR_LEN` from the file. Set bytes 8–11 (DIR_CRC32) to zero. Compute CRC32 over this buffer. It must equal the stored DIR_CRC32.
3. For each entry: if `CHUNK_TYPE` is supported, read payload from `OFFSET`, length `LEN`. Compute CRC32 of that payload; it must equal the entry’s CRC32. If CRC fails, the chunk is corrupted.

---

## 4. Chunks

### 4.1 Chunk types (FourCC, u32 LE)

| Value       | Name   | Description |
|-------------|--------|-------------|
| 0x4D415246 | FRAM   | FRAMES – precomputed frame stream (required for playback) |
| 0x4154454D | META   | META – optional UTF-8 key/value pairs |
| 0x58444952 | FRAMIDX| FRAME_INDEX – optional per-frame offsets (e.g. for RLE) |

Unknown chunk types must be **ignored** (skip payload, do not fail).

### 4.2 FRAMES chunk (type FRAM, RAW mode)

- **CHUNK_VER** 1, **CHUNK_FLAGS** 0: RAW mode.
- Payload = concatenation of frames. Each frame is exactly **CHANNEL_COUNT** bytes (u8).
- Total payload size must equal `FRAME_COUNT * CHANNEL_COUNT`.
- Channel order: **On/Off first**, then **PWM**. Each value 0–255 (On/Off use 0 or 255).
- Playback: for `i = 0 .. FRAME_COUNT-1`, read frame at `OFFSET + i * CHANNEL_COUNT`, apply outputs, wait **TICK_MS** ms, repeat.

### 4.3 RLE mode (future)

If CHUNK_FLAGS indicates RLE, the firmware maintains a buffer of CHANNEL_COUNT bytes and each frame is encoded as segments (START_CH, LEN_CH, DATA). Not used in current writer.

---

## 5. CRC32 algorithm

- Polynomial: standard CRC-32 (0xEDB88320), initial value 0xFFFFFFFF, final XOR 0xFFFFFFFF.
- Input: raw bytes (e.g. header with CRC field zeroed, directory with CRC field zeroed, or chunk payload).
- Output: 32-bit value stored/compared as u32 LE.

Reference (table-based): for each byte `b`, `crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8)`; init 0xFFFFFFFF, after all bytes return `crc ^ 0xFFFFFFFF`.

---

## 6. Verification checklist

Perform in this order:

1. **File size**  
   `file_size >= 32` and `file_size >= DIR_OFFSET + DIR_LEN`.

2. **Header**  
   MAGIC = LFP1, CONTAINER_VER supported, HEADER_LEN ≥ 32.  
   Compute header CRC32 (bytes 0–27, bytes 28–31 = 0). Must match header at 28–31.

3. **Directory**  
   Read buffer at [DIR_OFFSET, DIR_OFFSET + DIR_LEN). DIR_MAGIC = DIR1.  
   Zero bytes 8–11, compute CRC32. Must match stored DIR_CRC32.

4. **Directory entries**  
   For each entry: check OFFSET + LEN ≤ file_size.  
   For supported chunk types: read payload [OFFSET, OFFSET+LEN), compute CRC32, must match entry CRC32.

5. **FRAMES chunk (required)**  
   Find entry with CHUNK_TYPE = FRAM.  
   Check `LEN == FRAME_COUNT * CHANNEL_COUNT`.  
   If CHUNK_VER == 1 and CHUNK_FLAGS == 0, use RAW playback.  
   Duration (real) = `FRAME_COUNT * TICK_MS` ms.

6. **Playback**  
   For RAW: loop `i = 0 .. FRAME_COUNT-1`, output frame `i`, wait TICK_MS ms.

---

## 7. Conventions

- On/Off channels: value 0 = off, 255 = on.
- PWM channels: 0–255.
- Channel index 0 is first On/Off, then remaining On/Off, then PWM in order.
- Unknown chunk types: skip; unknown CHUNK_VER: skip or reject only if it is the FRAMES chunk.
