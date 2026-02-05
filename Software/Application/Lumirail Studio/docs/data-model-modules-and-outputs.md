# Data Model: Modules, Timeline, and 16 Outputs per Card

## Current Model vs Target

| Current | Target |
|---------|--------|
| Project → Scenes (each scene has its own timeline) | Project → one Timeline + multiple Modules |
| Scene blocks without output mapping | Blocks reference which outputs they drive |
| Card = UUID, scene mapping abstract | Card = 16 outputs (0–15), each controllable individually |

## Core Concepts

### Card
- Identified by UUID
- **16 LED outputs** (index 0-15), each controllable independently
 Hardware stores 2 scene slots (scene 1, scene 2) for RF trigger

### Output Address
 Uniquely identifies one LED: `{ cardId: string, outputIndex: 0..15 }`
- In multi-card project: Card A output 3 ≠ Card B output 3

### Module (Logical Grouping)
- User-defined group of outputs (e.g. "Street lights", "Building facade")
 Maps to one or more output addresses
 Example: Module "Lamp post" = Card A outputs [0, 1, 2]
 Simplifies authoring: one block can drive a whole module instead of 16 separate blocks

### Main Timeline
 **One main timeline per project** – reference axis (2–30 min = 24h, 500 ms granularity)
 Contains **bookmarks (signets)** only – no blocks
 Bookmarks: named anchors (e.g. "Lever du soleil", "Midi", "Coucher")
 Shared across all module timelines as vertical markers

### Module Timeline
 **One timeline per module**
 Each module has its own blocks (ON, OFF, effects)
 Same duration as main timeline
 **Bookmarks from main timeline appear on all module timelines** – vertical guides for alignment

## Proposed Data Structures

```ts
interface OutputAddress {
  cardId: string
  outputIndex: number  // 0-15
}

interface Bookmark {
  id: string
  positionMs: number
  label: string
}

interface TimelineBlock {
  id: string
  type: 'on' | 'off' | 'effect'
  startMs: number
  durationMs: number
}

interface Module {
  id: string
  projectId: string
  name: string
  outputAddresses: OutputAddress[]
  blocks: TimelineBlock[]       // blocks on this module's timeline
}

interface Project {
  id: string
  workspaceId: string
  name: string
  durationMinutes: number
  bookmarks: Bookmark[]         // main timeline – shared across modules
  modules: Module[]             // each module has its own timeline with blocks
}
```

## UX Implications

### Main Timeline + Module Timelines
- **Main timeline** (top): time ruler + bookmarks. Click to add/edit bookmark. No blocks.
- **Module timelines** (stacked below): one row per module, blocks on that module. Same time scale. **Bookmarks drawn as vertical lines** across all module rows.
- User aligns blocks to bookmarks (e.g. "Street lights ON at 'Coucher'").

### At 10+ Cards
- 10 cards × 16 outputs = 160 possible outputs
- Without modules: 160 tracks is too dense
- With modules: user groups outputs (e.g. "Zone Nord" = card1 out 0–7, card2 out 0–3). Fewer, meaningful tracks.

### Mapping UI
1. **Define modules**: Create module, name it, assign outputs (e.g. select card + outputs 0–3)
2. **Timeline**: Add blocks on module tracks; block affects all outputs in that module
3. **Preview**: Show state per output (or per module) over time

## Scene vs Timeline

Hardware stores 2 scenes per card. Options:

- **A – Project timeline = one "logical scene"**: User flashes the project timeline as scene 1 or 2. No separate scene entity; "scene" is just the flash target slot.
- **B – Scenes as snapshots**: Project has one timeline; "Scenes" are saved snapshots/versions. User picks which snapshot to flash as scene 1 or 2.
- **C – Keep scene entity**: Scene = named configuration of the timeline (blocks + modules). Project can have multiple scenes; each maps to timeline + module config. Flash = pick scene → flash to slot 1 or 2.

Recommendation: **A** for MVP (simplest), **B** or **C** if we need versioning or presets.

## Migration from Current Model

Current: `Scene` with `blocks[]`, `SceneBlock` without output refs.

Steps:
1. Add `Module` and `OutputAddress` types
2. Move `blocks` from Scene to Project (or to a single "main" scene)
3. Add `moduleId` to blocks
4. Add `durationMinutes` to Project (from Scene)
5. Card mapping: from "scene → card" to "module → outputs per card"

## Open Decisions

1. **Module vs direct output**: Allow blocks to target outputs directly (without module), or always go through modules?
2. **One block, multiple modules**: Can one block drive several modules? (e.g. "All street lights" = modules A + B)
3. **Effect parameters**: For `type: 'effect'`, need params (e.g. fade duration, curve). To be defined with preset/effect model.
