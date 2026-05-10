# CAN line bonding

Each physical CAN line on a Lumirail gateway carries two logical CAN
buses, run in parallel on independent transceivers and twisted pairs.
This is done to raise the effective throughput on a line, to keep
latency low when scenes are pushed in real-time, and to give us a
clean fallback path if one bus loses arbitration or its transceiver
dies.

This document defines how the two logical buses on a single physical
line are aggregated into one bonded transport.

## 1. Goals and non-goals

Goals:

- Roughly double the usable throughput per physical CAN line.
- Bound out-of-order delivery to a small reorder window so the
  receiver can reconstruct in-order streams cheaply.
- Survive the loss of one of the two buses without losing data,
  with explicit signalling to the application.

Non-goals:

- True hot-redundant (1+1) replication of every frame. That would
  halve the throughput and is not what we want here; redundancy is
  a fallback mode, not the steady state.
- Interoperability with non-bonded peers on the same line. Both
  ends must be bonded-aware. CAN cards behind the gateway must run
  the matching bonded receiver.

## 2. Topology recap

| Variant  | Physical lines | Logical buses per line | Total logical buses |
|----------|:--------------:|:----------------------:|:-------------------:|
| Standard | 1              | 2                      | 2                   |
| Plus     | 2              | 2                      | 4                   |
| Pro      | 3              | 2                      | 6                   |

Each pair of logical buses on a physical line is referenced by an index
`(L, b)` where `L` is the line number (1..N) and `b` is the bus inside
the line (`A` or `B`). Bonding only happens within a single `L`.

## 3. Bonded transport overview

We layer a thin bonded transport on top of two ordinary CAN buses. Above
this layer, the rest of the firmware sees one logical pipe per physical
line. Below this layer, two TWAI / SPI-CAN drivers handle the actual
arbitration.

```
   application (LMS pass-through, gateway control, scene push)
                            |
              bonded transport (this document)
                  |                       |
            CAN bus L.A             CAN bus L.B
```

## 4. Frame layout

CAN data fields are 8 bytes (classical CAN). The bonded transport uses
the first 2 bytes of each data field as a header:

| Bits  | Name      | Meaning                                                    |
|-------|-----------|------------------------------------------------------------|
| 15    | M         | More-fragments flag (1 = another fragment follows)         |
| 14    | F         | First-fragment flag (1 = this is the first fragment)       |
| 13-11 | CLASS     | Traffic class (0 = control, 1 = scene, 2 = realtime, ...)  |
| 10-0  | SEQ       | 11-bit sequence number, modulo 2048                        |

The remaining 6 bytes are payload. SEQ is line-wide (not per bus): the
sender increments it once per fragment, regardless of which of the two
buses transports the fragment.

A logical message is therefore a contiguous run of fragments
`F=1, M=1, M=1, ..., M=0`, all sharing the same CLASS and consecutive
SEQ values (modulo 2048).

## 5. Send strategy: weighted round-robin with class awareness

The sender keeps two queues per physical line:

- High-priority queue (CLASS 0..1: control, scene metadata).
- Bulk queue (CLASS 2..7: scene blocks, telemetry, dumps).

Each queue is striped across the two buses with weighted round-robin:
the next fragment goes to whichever bus is least loaded, measured by
the depth of its TX FIFO and the elapsed time since its last
successful transmit.

This gives roughly `2x` throughput while letting a momentarily
congested bus shed load to the other one. It also avoids head-of-line
blocking: a stuck bulk fragment on bus A does not delay a control
fragment that the scheduler can route through bus B.

## 6. Receive: small reorder window

The receiver sees fragments arriving from both buses and must rebuild
each logical message. A 64-fragment reorder window is enough in
practice (well above the worst-case time skew between the two buses).

Algorithm:

1. On each fragment, look up the in-flight message identified by
   `(CLASS, SEQ_of_first_fragment)`. The first fragment is recognized
   by `F=1`; it allocates the reassembly slot.
2. Insert the fragment in the slot at offset
   `(SEQ - SEQ_of_first_fragment) mod 2048`.
3. When the slot has all fragments up to `M=0`, deliver the message
   to the upper layer.
4. If a slot has been waiting longer than the bonded timeout
   (default 200 ms), drop it and signal `BONDED_LOST` upwards with
   the offending CLASS and SEQ range.

In-flight slots are bounded by class to avoid one chatty class
starving another.

## 7. Failover

Each bus is monitored for:

- Bus-off events from the controller.
- TX timeouts (no successful frame in 100 ms while the queue is non
  empty).
- RX silence (no frame received in 1 s when the peer is announced as
  active).

When a bus is declared down:

1. The scheduler stops issuing fragments to it; both flows go to the
   surviving bus.
2. Throughput halves but the line keeps working.
3. The bonded transport raises a `BONDED_DEGRADED` event to the
   application; the Studio surfaces this on the gateway status page.

When a bus comes back (controller cleared, or peer responds again):

1. The scheduler ramps it up gradually (one fragment per 10 ms during
   the first second) to confirm stability.
2. After 1 s of clean operation, weight is restored to nominal and a
   `BONDED_HEALTHY` event is emitted.

## 8. Class table (initial)

| Class | Name      | Use                                                       |
|------:|-----------|-----------------------------------------------------------|
| 0     | CONTROL   | Bonded control: keep-alive, peer announce, time sync      |
| 1     | SCENE_CMD | Scene start/stop, hash queries, diff handshake            |
| 2     | SCENE_BLK | Scene block payload (bulk)                                |
| 3     | LMS_CMD   | LMS card commands (LED on/off, ping, status)              |
| 4     | TELEMETRY | Periodic telemetry from LMS cards                         |
| 5..7  | -         | Reserved                                                  |

Higher-priority classes preempt lower ones at the bus arbitration ID
level: each class owns a contiguous range of CAN IDs, with class 0
holding the lowest IDs (highest priority).

## 9. Standard vs Plus vs Pro

The bonding logic is identical on all three variants. Plus and Pro
just instantiate the bonded transport once per physical line:

| Variant  | Bonded transports running |
|----------|:-------------------------:|
| Standard | 1                         |
| Plus     | 2                         |
| Pro      | 3                         |

Cross-line traffic (e.g. a scene that targets cards on lines 1 and 2)
is handled above the bonded layer by a small router. It is not part
of the bonded transport itself.

## 10. Open questions

- CAN-FD: if the chosen P4 silicon and SPI front-end support CAN-FD
  in production, the bonded transport stays valid; the only change is
  payload size (up to 64 bytes) and the SEQ field can grow if we want
  a larger reorder window.
- Time sync: a global tick across the bonded line is needed for
  scene playback alignment across cards. The CONTROL class will
  carry a periodic sync frame, broadcast on both buses, with the
  receiver picking the earliest arrival.
