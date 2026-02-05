export interface SerialPortLike {
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}

function createStreams(es: NonNullable<Window['electronSerial']>): {
  port: SerialPortLike
  close: () => void
} {
  const dataQueue: Uint8Array[] = []
  let resolveWait: (() => void) | null = null
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
  let closed = false

  const safeEnqueue = (controller: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array) => {
    if (closed) return
    try {
      controller.enqueue(chunk)
    } catch (_) {}
  }

  const readable = new ReadableStream<Uint8Array>({
    pull(controller) {
      streamController = controller
      return new Promise<void>((resolve) => {
        if (dataQueue.length > 0) {
          const chunk = dataQueue.shift()!
          safeEnqueue(controller, chunk)
          streamController = null
          resolve()
          return
        }
        resolveWait = () => {
          resolveWait = null
          if (dataQueue.length > 0) {
            const chunk = dataQueue.shift()!
            safeEnqueue(controller, chunk)
          }
          streamController = null
          resolve()
        }
      })
    },
  })

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      const buf = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk
      return es.write(buf)
    },
  })

  const unsubData = es.onData((data: Uint8Array | Buffer) => {
    if (closed) return
    dataQueue.push(data instanceof Uint8Array ? data : new Uint8Array(data))
    resolveWait?.()
  })

  return {
    port: { readable, writable },
    close: () => {
      closed = true
      unsubData()
      if (streamController) {
        try { streamController.close() } catch (_) {}
        streamController = null
      }
      resolveWait?.()
    },
  }
}

export function createElectronSerialAdapter(): {
  getPort: () => SerialPortLike | null
  isConnected: () => boolean
  onConnected: (cb: () => void) => () => void
  onDisconnected: (cb: () => void) => () => void
  unsubscribe: () => void
} {
  const es = typeof window !== 'undefined' ? window.electronSerial : undefined
  if (!es) {
    return {
      getPort: () => null,
      isConnected: () => false,
      onConnected: () => () => {},
      onDisconnected: () => () => {},
      unsubscribe: () => {},
    }
  }

  let connected = false
  let port: SerialPortLike | null = null
  let closeStreams: (() => void) | null = null
  const connectedCallbacks: (() => void)[] = []

  const setConnected = () => {
    if (closeStreams) closeStreams()
    const { port: p, close } = createStreams(es)
    port = p
    closeStreams = close
    connected = true
    connectedCallbacks.forEach((cb) => cb())
  }

  const unsubConnected = es.onConnected(setConnected)

  es.isConnected().then((ok) => {
    if (ok && !connected) setConnected()
  })

  const unsubDisconnected = es.onDisconnected(() => {
    connected = false
    if (closeStreams) {
      closeStreams()
      closeStreams = null
    }
    port = null
  })

  return {
    getPort: () => (connected ? port : null),
    isConnected: () => es.isConnected(),
    onConnected: (cb) => {
      connectedCallbacks.push(cb)
      if (connected) cb()
      return () => {
        const i = connectedCallbacks.indexOf(cb)
        if (i >= 0) connectedCallbacks.splice(i, 1)
      }
    },
    onDisconnected: (cb) => es.onDisconnected(cb),
    unsubscribe: () => {
      unsubConnected()
      unsubDisconnected()
      if (closeStreams) {
        closeStreams()
        closeStreams = null
      }
    },
  }
}
