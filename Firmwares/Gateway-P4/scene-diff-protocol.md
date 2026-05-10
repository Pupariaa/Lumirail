# Differential scene upload

Scenes can grow large (long timelines, many channels). Today the Studio
re-uploads the whole LFP file on every save. When the user changes a
single output for a few frames, this is wasteful: the upload time is
dominated by data the LMS card already has.

The differential upload protocol described here lets the Studio push
only the parts that actually changed, while preserving the integrity
guarantees of the current full upload (CRC32 + SHA-256).

This document is independent of the gateway variant; it lives in the
gateway folder because the gateway is the entity that maintains the
per-card manifest and runs the diff handshake.

## 1. Targets

- An LMS card behind the gateway already holds a scene `S_old` on its
  SD card.
- The Studio has produced a new scene `S_new` and wants the card to
  end up with `S_new`.
- After the operation, the LMS card must hold exactly `S_new`. If
  any verification step fails, the card must roll back to `S_old`.
- The amount of data sent over the wire (USB or CAN) must be
  proportional to the actual change between `S_old` and `S_new`,
  not to the size of `S_new`.

## 2. Manifest

For every scene on every LMS card, the gateway maintains a small
manifest. It is recomputed each time a scene is fully uploaded and
kept in sync with the card.

```
manifest:
  scene_size                    : u32
  scene_sha256                  : 32 bytes
  block_size                    : u16   (256, same as today)
  block_count                   : u32
  block_hashes                  : block_count * 16 bytes (SHA-256 truncated to 128 bits)
  channel_count                 : u16
  frame_count                   : u32
  channel_hashes                : channel_count * 16 bytes (SHA-256 over the column of values)
```

The manifest is stored:

- On the gateway: in NVS, keyed by `(line, can_id)` of the LMS card.
- On the LMS card: as `scene.manifest` next to `scene.bin`. The card
  rewrites it atomically (write `.tmp`, fsync, rename) every time
  `scene.bin` is updated.

Block hashes are truncated SHA-256 (128 bits). At 256-byte blocks and
a typical scene of 256 KB, that is 1024 hashes of 16 bytes = 16 KB
of manifest, which is small compared to the scene itself.

Channel hashes are an extra view over the same data, hashed
column-by-column (one column = the values of one channel across all
frames). They are the foundation of the column-level diff in section 5.

## 3. Hash hierarchy

The protocol uses three levels of hash:

1. `scene_sha256`: full file fingerprint. Verifies the final result
   bit-for-bit.
2. `block_hashes[i]`: covers byte range `[i*256, (i+1)*256)`. Used to
   detect which blocks changed when the layout (header, directory,
   block boundaries) is preserved.
3. `channel_hashes[c]`: covers the values of channel `c` across all
   frames. Used when the change is structural (a few channels changed
   for many frames), so block-level diff would be inefficient.

The Studio chooses which level it sends; the card always validates the
final `scene_sha256`.

## 4. Block-level diff (preferred path)

This works when `S_new` and `S_old` share the same `block_size`,
`channel_count`, `frame_count`, and the same chunk layout (FRAMES at
the same offset, same length). This is the common case.

### 4.1 Handshake

```
Studio  -> Gateway -> LMS  : SCENE_DIFF_QUERY:scene_sha256_new
LMS     -> Gateway -> Studio: SCENE_DIFF_HAVE:scene_sha256_old:block_count
```

If `scene_sha256_old == scene_sha256_new`, the card already has the
right scene; the Studio stops here.

### 4.2 Hash exchange

The Studio sends its full block-hash list:

```
Studio -> LMS: SCENE_DIFF_HASHES:block_count
                <block_count * 16 bytes binary>
```

The card compares each new hash to its stored hash and replies with
the indices that differ:

```
LMS -> Studio: SCENE_DIFF_NEED:n
               <n * u32 binary, indices of blocks to send>
```

If `n == 0`, the only thing that differs is something outside the
covered range (e.g. header CRC after a metadata-only edit). The Studio
falls back to a full upload.

### 4.3 Block transfer

For each needed index `i`, the Studio sends one block, reusing the
existing block format from `lfp-protocol.md` section 7:

```
Studio -> LMS: SCENE_BLOCK:i:len:crc32hex \n
               <len bytes>
LMS    -> Studio: SCENE_BLOCK_OK:i  | SCENE_BLOCK_ERR:i
```

The card writes received blocks into a `scene.tmp` initialized as a
copy of `scene.bin`. This way, blocks that were already correct stay
in place and only the differing ones are overwritten.

### 4.4 Final verify and commit

Same shape as the existing protocol: the Studio sends the new
SHA-256, the card recomputes it on `scene.tmp`, and on success it
swaps `scene.bin` with `scene.tmp`. The manifest is rewritten last.

```
Studio -> LMS: SCENE_HASH_BIN \n  <32 bytes>
LMS    -> Studio: SCENE_OK  | SCENE_ERR:verify
```

If verify fails, the card discards `scene.tmp` and the manifest stays
on the previous state.

## 5. Column-level diff (structural changes)

When the user retunes a single channel for the whole timeline, the
block-level diff still has to resend a lot of blocks (every block
that contains a byte from that channel). The column-level diff fixes
this.

### 5.1 Eligibility

This path is used only when:

- `S_new` and `S_old` share the same `channel_count` and `frame_count`.
- Both files use the FRAMES chunk in RAW mode (CHUNK_VER 1, FLAGS 0).
- The set of changed channels is small (a configurable threshold,
  typically `< 10%` of `channel_count`).

If those conditions are not met, the Studio falls back to the
block-level diff.

### 5.2 Handshake

```
Studio -> LMS: SCENE_DIFF_COL_QUERY:scene_sha256_new:channel_count
LMS    -> Studio: SCENE_DIFF_COL_HASHES:channel_count
                  <channel_count * 16 bytes>
```

The Studio compares each card hash to its own per-channel hash and
identifies the changed channel set `C`.

### 5.3 Column transfer

For each channel `c` in `C`, the Studio sends the new column:

```
Studio -> LMS: SCENE_DIFF_COL:c:frame_count:crc32hex \n
               <frame_count bytes>
LMS    -> Studio: SCENE_DIFF_COL_OK:c  | SCENE_DIFF_COL_ERR:c
```

The card patches `scene.tmp` in place: byte at offset
`FRAMES_offset + frame * channel_count + c` is updated for every
frame in the column.

### 5.4 Final verify and commit

Same as block-level: full SHA-256 verify, atomic swap, manifest
rewrite.

## 6. Failure handling

- The protocol is restartable: the manifest on the card always
  matches `scene.bin`. A failed diff session leaves `scene.tmp`
  behind; the next session deletes it before starting.
- If the Studio loses the connection mid-transfer, the card waits
  for `SCENE_HASH_BIN` until a 30 s timeout, then drops `scene.tmp`.
- If the card hashes in the manifest are corrupt (CRC fail on the
  manifest itself), the card declares the manifest invalid via
  `SCENE_DIFF_HAVE:none`. The Studio falls back to a full upload,
  which also rebuilds the manifest.

## 7. What this changes in the existing protocol

Existing prefixes from `lfp-protocol.md` are kept untouched. The new
prefixes added by this document are:

- `SCENE_DIFF_QUERY`, `SCENE_DIFF_HAVE`
- `SCENE_DIFF_HASHES`, `SCENE_DIFF_NEED`
- `SCENE_DIFF_COL_QUERY`, `SCENE_DIFF_COL_HASHES`
- `SCENE_DIFF_COL`, `SCENE_DIFF_COL_OK`, `SCENE_DIFF_COL_ERR`

A card that does not implement diff replies `SCENE_DIFF_HAVE:none` to
any `SCENE_DIFF_QUERY` and the Studio falls back to the full upload.
This keeps older LMS firmwares fully compatible.

## 8. Estimated savings

For a typical scene of 256 KB with a single-channel edit (one channel
changed across 1024 frames at 256 channels total):

- Full upload: 256 KB.
- Block-level diff: every 256-byte block contains 1 byte from each
  channel, so all 1024 blocks contain at least one changed byte.
  Worst case: 256 KB. So block-level diff alone does not help here.
- Column-level diff: 1 channel * 1024 frames = 1 KB of payload, plus
  256 channel hashes * 16 bytes = 4 KB of hashes. Total ~5 KB,
  ~50x smaller than the full upload.

For a small edit limited to a few frames (e.g. one channel for 10
frames), block-level diff wins (only 10 blocks differ at most), so
the Studio picks that path. The Studio decides which path to take
based on the diff it computes locally before talking to the card.
