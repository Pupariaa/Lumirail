export const UNDO_EVENT = 'lumirail:undo'
export const REDO_EVENT = 'lumirail:redo'

export function dispatchUndo() {
  window.dispatchEvent(new CustomEvent(UNDO_EVENT))
}

export function dispatchRedo() {
  window.dispatchEvent(new CustomEvent(REDO_EVENT))
}
