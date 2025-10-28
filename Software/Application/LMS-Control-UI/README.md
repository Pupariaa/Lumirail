# Lumirail Studio

Professional control software for LumiRail LMS systems (LMS-S1-G2, and future models).

## Technology Stack

- **Electron**: Desktop application framework
- **React**: UI framework
- **TypeScript**: Type-safe JavaScript
- **Zustand**: State management
- **Webpack**: Module bundler

## Project Structure

```
Lumirail-Studio/
├── src/
│   ├── main/                  # Electron main process
│   │   └── index.ts          # Entry point, window management
│   ├── preload/              # Preload scripts (bridge)
│   │   └── index.ts          # IPC API exposure
│   ├── renderer/             # React application
│   │   ├── components/       # React components
│   │   ├── store/           # Zustand state management
│   │   ├── styles/          # CSS styles
│   │   ├── App.tsx          # Root component
│   │   └── index.tsx        # React entry point
│   └── shared/              # Shared types
│       └── types.ts         # TypeScript interfaces
├── webpack.*.config.js      # Webpack configurations
├── tsconfig.json           # TypeScript configuration
├── package.json
└── README.md
```

## Features

- ✅ **TypeScript**: Full type safety
- ✅ **Modern UI**: Professional dark theme
- ✅ **State Management**: Zustand for reactive state
- ✅ **Security**: Context isolation, CSP
- ✅ **Developer Experience**: Hot reload, linting
- ✅ **Modular Architecture**: Clear separation of concerns
- ✅ **Mock API**: Ready for API Bridge integration

## Installation

```bash
npm install
```

## Development

```bash
# Start development server
npm run dev

# In another terminal, start Electron
npm start
```

## Building

```bash
# Build for production
npm run build

# Start production build
npm start
```

## Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format
```

## Components

### Main Process (`src/main/`)
- Window management
- IPC handlers (mock API for now)
- Application lifecycle

### Preload (`src/preload/`)
- Secure bridge between main and renderer
- Exposes `window.lmsAPI` to renderer

### Renderer (`src/renderer/`)
- React application
- UI components
- State management with Zustand

### Key Components:
- **Header**: App title, version, connection status
- **ConnectionPanel**: Serial port connection
- **SlavesPanel**: List and manage discovered slaves
- **SlaveCard**: Individual slave information and actions
- **StatsPanel**: System statistics
- **LogsPanel**: Activity logs

## State Management

Uses Zustand for simple, efficient state management:

```typescript
const { connected, slaves, addLog } = useAppStore();
```

State includes:
- Connection status
- Discovered slaves
- Statistics
- Selected slave
- Activity logs

## API Integration

Currently uses mock data. API handlers are prepared for future integration with the API Bridge:

```typescript
// src/main/index.ts
ipcMain.handle('api:connect', async (_event, port: string) => {
  // TODO: Implement with API Bridge
});
```

## Styling

- Modern dark theme
- CSS custom properties for theming
- Responsive grid layout
- Professional animations and transitions

## Security

- **Context Isolation**: Enabled
- **Node Integration**: Disabled
- **Content Security Policy**: Strict CSP headers
- **Secure IPC**: All communication through preload script

## Best Practices

✅ **TypeScript strict mode**  
✅ **Proper error handling**  
✅ **Component isolation**  
✅ **Type-safe IPC communication**  
✅ **Clean code structure**  
✅ **Performance optimized**  
✅ **Accessibility considered**  

## Future Integration

The app is ready for API Bridge integration. Simply update the IPC handlers in `src/main/index.ts` to call the Python API Bridge instead of returning mock data.

## License

© 2025 Puparia - Lumirail Studio

