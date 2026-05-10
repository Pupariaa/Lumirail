# Architecture Notes

## Data Persistence (v1)

- **v1:** Local storage via `src/storage/` abstraction. Adapter pattern allows swapping implementation without changing consumers.
- Workspace, project, and scene data persist in browser local storage (Story 1.5).

## Gateway USB host & project reference (portable archive)

- **USB-A on the gateway** is intended as a **USB mass-storage host**: a USB flash drive holds **raw scenes (e.g. LFP)**, **configuration**, and an **exportable project snapshot** so another application can reconstruct the full project without depending only on Lumirail Studio’s local data.
- **Lumirail Studio is not the single source of truth** when the operator chooses **gateway + key** as the reference: preference `projectStorageOrigin` is either `studio` (this machine’s persisted workspaces via `StorageAdapter`) or `gateway_usb` (logical reference pointing at the gateway archive — full bidirectional sync is implemented incrementally with firmware).
- When the gateway reports a mounted key over the management link, the app shows a prompt to **switch reference** to the gateway USB archive vs **stay on this computer**.
- **Serial lines (firmware → Studio):** `GW_USB:1` / `GW_USB:present` = key present; `GW_USB:0` / `GW_USB:absent` = absent. Parsed in `serialConnection.ts`; dialog is handled by `ProjectStorageProvider`.

## Future Cloud / Sync Migration

- Storage abstraction (`StorageAdapter` interface) is designed for replacement.
- To migrate to cloud:
  1. Implement `StorageAdapter` with cloud backend (REST, GraphQL, etc.).
  2. Swap adapter at app bootstrap; no consumer code changes required.
  3. Consider sync strategy (offline-first, conflict resolution) when designing cloud adapter.

## Epic Placeholders

- **Epic 1 (Auth):** `src/` ready for auth modules (registration, login, password reset).
- **Epic 2 (Workspaces):** Project structure supports workspace/project features.
- **Epic 3 (Timeline):** Layout prepared for timeline and scene components.
- **Epic 4 (Preview):** No dependencies that would block preview implementation.
- **Epic 5 (Cards):** Card management modules can be added under `src/`.
- **Epic 6 (Binary/Flash):** Web Serial usage will be isolated; binary generation can live in dedicated module.
