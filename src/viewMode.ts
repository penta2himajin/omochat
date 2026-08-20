import { clamp, paginateHistory, type ChatMessage, type Mode, type ViewMode } from './display.ts'

export type ViewModeToggleState = {
  mode: Mode
  viewMode: ViewMode
  chatReady: boolean
  probeOnly: boolean
  companionProbe: boolean
  messages: ChatMessage[]
  historyPageIndex: number
}

/**
 * Pure view-mode toggle. Returns null when the gesture should be ignored
 * (thinking / not ready / probe modes).
 */
export function applyViewModeToggle(state: ViewModeToggleState): ViewModeToggleState | null {
  if (state.mode === 'thinking') return null
  if (!state.chatReady || state.probeOnly || state.companionProbe) return null

  if (state.viewMode === 'selection') {
    const pages = paginateHistory(state.messages)
    return {
      ...state,
      viewMode: 'history',
      historyPageIndex: Math.max(0, pages.length - 1),
    }
  }

  return {
    ...state,
    viewMode: 'selection',
  }
}

export function applyHistoryPageDelta(
  state: ViewModeToggleState,
  delta: number,
): ViewModeToggleState | null {
  if (state.mode !== 'idle' || state.viewMode !== 'history') return null
  const pages = paginateHistory(state.messages)
  return {
    ...state,
    historyPageIndex: clamp(state.historyPageIndex + delta, 0, Math.max(0, pages.length - 1)),
  }
}

/**
 * Full text replace for TextContainerUpgrade.
 * Do not send contentOffset/contentLength — those are partial-update fields and
 * can leave the host in a broken scroll/gesture state after long content.
 */
export function fullTextUpgradePayload(
  containerID: number,
  containerName: string,
  content: string,
): { containerID: number; containerName: string; content: string } {
  return { containerID, containerName, content }
}
