import { SessionError } from '../auth/types';
import { object } from '../auth/transfer';

export type BrowserPresentation = {
  authenticated: boolean;
  state: 'live' | 'idle' | 'starting' | 'unavailable';
  active: boolean;
  previewAvailable?: boolean;
  mode: 'agent' | 'human' | 'paused' | 'recovering' | 'takeover_pending';
  human: boolean;
  observing: boolean;
  canTake: boolean;
  canReturn: boolean;
  title: string;
  url: string;
  busy: boolean;
  returning?: boolean;
  uncertain: boolean;
  playback: 'connecting' | 'live' | 'stalled' | 'tap_required' | 'unavailable';
  inputReady: boolean;
  notice: string;
  previousDownloadsUnavailable: boolean;
};
export type BrowserCommand =
  | { action: 'present'; mode: 'full' | 'preview' }
  | { action: 'visibility'; mode: 'private' | 'observe' }
  | {
      action: 'key';
      key: 'tab' | 'enter' | 'escape' | 'backspace' | 'back' | 'reload';
    }
  | { action: 'zoom'; enabled: boolean }
  | { action: 'address'; value: string }
  | {
      action:
        | 'open'
        | 'take'
        | 'close'
        | 'return'
        | 'refresh'
        | 'reconnect'
        | 'keyboard'
        | 'dismissPreview'
        | 'hideKeyboard';
    };

export function canvasURL(origin: string, tab: string): string {
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !/^[a-f0-9-]{36}$/.test(tab)
  ) {
    throw new SessionError('invalid');
  }
  return `${url.origin}/mobile/browser?tab=${tab}`;
}

export function canvasNavigationAllowed(
  candidate: string,
  expected: string,
  top?: boolean,
): boolean {
  try {
    const url = new URL(candidate),
      root = new URL(expected);
    if (
      url.origin !== root.origin ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password
    )
      return false;
    return (
      url.href === root.href ||
      // Android WebView omits isTopFrame. Its fallback still admits only the
      // owned stream path; native messages separately require the canvas URL.
      (top !== true && url.pathname.startsWith('/chat/browser/stream/'))
    );
  } catch {
    return false;
  }
}

// Android's WebMessageListener reports sourceOrigin, not a document URL.
// Accept that form only while the top-level document is the fixed canvas.
// The sole admitted subframe is our pinned stream; public pages are pixels.
export function canvasMessageAllowed(
  candidate: string,
  expected: string,
  platform: string,
  loadedDocument: string | null,
): boolean {
  if (canvasNavigationAllowed(candidate, expected, true)) return true;
  return (
    platform === 'android' &&
    loadedDocument === expected &&
    candidate === new URL(expected).origin
  );
}

export function readPresentation(raw: string): {
  event: 'state' | 'expired' | 'returned';
  value: BrowserPresentation;
} {
  if (raw.length > 8192) throw new SessionError('invalid');
  const v = object(JSON.parse(raw));
  if (
    v.schema !== 'radhouse.mobile-browser.v1' ||
    !['state', 'expired', 'returned'].includes(String(v.event)) ||
    !['live', 'idle', 'starting', 'unavailable'].includes(String(v.state)) ||
    !['agent', 'human', 'paused', 'recovering', 'takeover_pending'].includes(
      String(v.mode),
    ) ||
    !['connecting', 'live', 'stalled', 'tap_required', 'unavailable'].includes(
      String(v.playback),
    )
  )
    throw new SessionError('invalid');
  for (const key of [
    'authenticated',
    'active',
    'human',
    'observing',
    'canTake',
    'canReturn',
    'busy',
    'uncertain',
    'inputReady',
    'previousDownloadsUnavailable',
  ]) {
    if (typeof v[key] !== 'boolean') throw new SessionError('invalid');
  }
  for (const [key, limit] of [
    ['title', 512],
    ['url', 4096],
    ['notice', 512],
  ] as const) {
    if (typeof v[key] !== 'string' || v[key].length > limit)
      throw new SessionError('invalid');
  }
  if (
    v.previewAvailable !== undefined &&
    typeof v.previewAvailable !== 'boolean'
  )
    throw new SessionError('invalid');
  if (v.returning !== undefined && typeof v.returning !== 'boolean')
    throw new SessionError('invalid');
  // Presentation data carries no capability or credentials and cannot invoke native actions.
  const {
    authenticated,
    state,
    active,
    mode,
    human,
    observing,
    canTake,
    canReturn,
    title,
    url,
    busy,
    uncertain,
    playback,
    inputReady,
    notice,
    previousDownloadsUnavailable,
  } = v;
  return {
    event: v.event as 'state' | 'expired' | 'returned',
    value: {
      authenticated,
      state,
      active,
      ...(v.previewAvailable === undefined
        ? {}
        : { previewAvailable: v.previewAvailable }),
      mode,
      human,
      observing,
      canTake,
      canReturn,
      title,
      url,
      busy,
      ...(v.returning === undefined ? {} : { returning: v.returning }),
      uncertain,
      playback,
      inputReady,
      notice,
      previousDownloadsUnavailable,
    } as BrowserPresentation,
  };
}

export function commandScript(command: BrowserCommand): string {
  return `window.RadhouseMobileBrowser?.command(${JSON.stringify(
    command,
  )});true;`;
}

export function browserLabel(state: BrowserPresentation | null): string {
  if (!state) return 'Connecting to your browser';
  if (state.uncertain) return 'Check the current page';
  if (state.human)
    return state.observing
      ? 'You control · Agent can read'
      : 'Private · Only you';
  if (state.mode === 'human') return 'Open on another device';
  if (state.mode === 'takeover_pending') return 'Handing control to you';
  if (state.mode === 'recovering') return 'Browser action needs review';
  if (state.mode === 'paused') return 'Browser paused';
  return state.active ? 'Agent is browsing' : 'Agent can browse';
}
