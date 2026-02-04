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

## 7. Upload Transport Protocol

Transfer of LFP binary over serial (Web Serial <-> ESP32-S3 bridge <-> ESP8266). Block-by-block with CRC verification and ACK before next block.

### 7.1 Block format

- Block size: 256 bytes (last block may be smaller)
- Line: `SCENE_BLOCK:i:len:crc32hex` (i=block index, len=bytes in block, crc32hex=8 hex chars)
- Then exactly `len` bytes binary
- CRC32: standard algorithm (section 5), over the `len` bytes only

### 7.2 Phase 1: Announcement

1. Web -> Digikey: `SCENE_UPLOAD_START:totalSize` (totalSize=bytes)
2. Digikey -> ESP8266: `SCENE_UPLOAD_START:totalSize`
3. ESP8266: delete scene.tmp if exists, respond `SCENE_UPLOAD_READY`
4. Digikey -> Web: `SCENE_UPLOAD_READY`

### 7.3 Phase 2: Web -> Digikey block transfer

For each block i (0 to numBlocks-1, numBlocks = ceil(totalSize/256)):

1. Web sends: `SCENE_BLOCK:i:len:crc32hex\n` then `len` bytes
2. Digikey: receive line, receive len bytes, compute CRC32, compare
3. If OK: write to scene.tmp, send `SCENE_BLOCK_OK:i`
4. If fail: send `SCENE_BLOCK_ERR:i`, Web may retry or abort
5. Web waits for `SCENE_BLOCK_OK:i` before sending block i+1

### 7.4 Phase 3: Verify file on Digikey

1. Web -> Digikey: `SCENE_GET_HASH`
2. Digikey: compute CRC32 and SHA256 of scene.tmp
3. Digikey -> Web: `SCENE_HASH:crc32hex:sha256hex`
4. Web: compare with local hash; if OK continue, else abort

### 7.5 Phase 4: Digikey -> ESP8266 transfer

1. Web -> Digikey: `SCENE_SEND_TO_MODULE:sha256hex` (hash for final verify)
2. Digikey -> ESP8266: `SCENE_START:totalSize`
3. ESP8266: delete scene.tmp if exists, open for write, send `SCENE_START_OK`
4. Digikey: wait for `SCENE_START_OK`, then for each block:
   - Digikey sends: `SCENE_BLOCK:i:len:crc32hex\n` + len bytes
   - Digikey waits for `SCENE_BLOCK_OK:i` before next block
5. ESP8266: verify CRC per block, write, send `SCENE_BLOCK_OK:i` or `SCENE_BLOCK_ERR:i`
6. ESP8266: when last block written, send `SCENE_UPLOAD_DONE`
7. When last block OK: Digikey sends hash to ESP8266 as **binary**: line `SCENE_HASH_BIN\n` then exactly **32 raw bytes** (SHA-256 of the file). No hex encoding.

### 7.6 Phase 5: Commit on ESP8266

1. ESP8266 receives line `SCENE_HASH_BIN`, then reads exactly 32 bytes (expected SHA-256)
2. ESP8266: compute SHA256 of scene.tmp, compare with the 32 bytes
3. If OK: scene.bin -> scene.bak, scene.tmp -> scene.bin, send `SCENE_OK`
4. If fail: clear scene.bin, scene.bak -> scene.bin, send `SCENE_ERR:verify`

### 7.7 Scene download (Web <- ESP8266)

1. Web -> Digikey -> ESP8266: `SCENE_DUMP`
2. ESP8266: read scene.bin, send hex-encoded chunks: `SCENE_DUMP:offset_hex:data_hex` (offset=4 hex, data=hex)
3. ESP8266: send `SCENE_DUMP_END:total_bytes` or `SCENE_DUMP_ERR:nofile` / `SCENE_DUMP_ERR:open`
4. Web: reassemble binary from chunks, trigger .lfp file download

---

## 8. Conventions

- On/Off channels: value 0 = off, 255 = on.
- PWM channels: 0–255.
- Channel index 0 is first On/Off, then remaining On/Off, then PWM in order.
- Unknown chunk types: skip; unknown CHUNK_VER: skip or reject only if it is the FRAMES chunk.
