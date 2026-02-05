# Browser Compatibility

## Target Browsers (v1)

| Browser | Min Version | Notes |
|---------|-------------|-------|
| Chrome  | 90+         | Full support including Web Serial (flash, dongle) |
| Edge    | 90+         | Full support including Web Serial |
| Firefox | 90+         | Core app supported; Web Serial not available |
| Safari  | 15+         | Core app supported; Web Serial not available |

## Graceful Degradation

### Web Serial API

- **Available:** Chrome, Edge (Chromium-based)
- **Not available:** Firefox, Safari

When Web Serial is unavailable:
- Binary generation and card management remain fully functional
- Flash-to-card and RF dongle features are disabled or hidden
- User receives clear messaging: "Flash requires Chrome or Edge"
- No errors; UI adapts to show only available features

### Implementation Note

Feature detection: `'serial' in navigator` before offering flash/dongle flows.
