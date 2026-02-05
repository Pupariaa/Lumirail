# Architecture Notes

## Data Persistence (v1)

- **v1:** Local storage via `src/storage/` abstraction. Adapter pattern allows swapping implementation without changing consumers.
- Workspace, project, and scene data persist in browser local storage (Story 1.5).

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
