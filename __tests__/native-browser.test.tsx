import React from 'react';
import { BackHandler, Platform } from 'react-native';
import { fireEvent, render, act } from '@testing-library/react-native';
import { NativeBrowser } from '../src/browser/NativeBrowser';
import {
  BrowserPresentation,
  canvasURL,
  canvasNavigationAllowed,
  canvasMessageAllowed,
  commandScript,
  readPresentation,
} from '../src/browser/protocol';

const mockInject = jest.fn(),
  mockReload = jest.fn();
jest.mock('react-native-webview', () => {
  const ReactModule = require('react');
  return {
    WebView: ReactModule.forwardRef(function MockWebView(
      props: object,
      ref: unknown,
    ) {
      ReactModule.useImperativeHandle(ref, () => ({
        injectJavaScript: mockInject,
        reload: mockReload,
      }));
      return ReactModule.createElement('WebView', props);
    }),
  };
});
const origin = 'https://assistant.example.test';
const tab = '11111111-2222-4333-8444-555555555555';
const uri = canvasURL(origin, tab);
const state: BrowserPresentation = {
  authenticated: true,
  state: 'live',
  active: true,
  mode: 'agent',
  human: false,
  observing: false,
  canTake: true,
  canReturn: false,
  title: 'Example page',
  url: 'https://example.org/',
  busy: false,
  uncertain: false,
  playback: 'live',
  inputReady: false,
  notice: '',
  previousDownloadsUnavailable: false,
};
const packet = (value = state, event = 'state') =>
  JSON.stringify({ schema: 'radhouse.mobile-browser.v1', event, ...value });
beforeEach(() => jest.clearAllMocks());

test('canvas navigation admits only the exact root and owned stream, including Android frame metadata', () => {
  expect(canvasNavigationAllowed(uri, uri, true)).toBe(true);
  const stream = origin + '/chat/browser/stream/index.html';
  expect(canvasNavigationAllowed(stream, uri, false)).toBe(true);
  expect(canvasNavigationAllowed(stream, uri, undefined)).toBe(true);
  expect(canvasNavigationAllowed(stream, uri, true)).toBe(false);
  for (const candidate of [
    'https://foreign.example/',
    origin + '/settings',
    ['javascript', 'alert(1)'].join(':'),
    'https://u:p@assistant.example.test/mobile/browser',
    uri + 'other',
  ]) {
    expect(canvasNavigationAllowed(candidate, uri)).toBe(false);
  }
  expect(() => canvasURL('http://assistant.example.test', tab)).toThrow();
  expect(() => canvasURL(origin, 'not-a-tab')).toThrow();
});

test('native status is a bounded presentation contract, never capability data or a command', () => {
  const parsed = readPresentation(
    JSON.stringify({
      ...JSON.parse(packet()),
      lease_id: 'must-not-cross',
      command: 'take',
    }),
  );
  expect(parsed.value).toEqual(state);
  for (const raw of [
    packet({ ...state, title: 'x'.repeat(513) }),
    packet({ ...state, active: 'true' } as unknown as BrowserPresentation),
    packet({
      ...state,
      previewAvailable: 'true',
    } as unknown as BrowserPresentation),
    packet(state, 'take'),
    'x'.repeat(8193),
    '{}',
  ]) {
    expect(() => readPresentation(raw)).toThrow();
  }
  const text = '");window.unexpected=true;//';
  expect(commandScript({ action: 'address', value: text })).toContain(
    JSON.stringify(text),
  );
});

test('live chat card expands without taking control and private or inactive states hide the preview', () => {
  const props = {
    origin,
    tab,
    full: false,
    expand: jest.fn(),
    back: jest.fn(),
    onExpired: jest.fn(),
    onReturned: jest.fn(),
  };
  const ui = render(<NativeBrowser {...props} />);
  const view = () =>
    ui.getByTestId('browser-canvas', { includeHiddenElements: true });
  const publish = (value: BrowserPresentation) =>
    fireEvent(view(), 'message', {
      nativeEvent: { url: uri, data: packet(value) },
    });
  expect(ui.queryByLabelText('Expand live browser: Example page')).toBeNull();
  publish(state);
  fireEvent.press(ui.getByLabelText('Expand live browser: Example page'));
  expect(props.expand).toHaveBeenCalledTimes(1);
  expect(
    mockInject.mock.calls.every(
      ([script]) => !script.includes('"action":"take"'),
    ),
  ).toBe(true);
  ui.rerender(<NativeBrowser {...props} full />);
  expect(view().props.source.uri).toBe(uri);
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'present', mode: 'full' }),
  );
  fireEvent.press(ui.getByLabelText('Take control'));
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'take' }),
  );
  ui.rerender(<NativeBrowser {...props} />);
  publish({ ...state, active: false });
  expect(ui.queryByLabelText('Expand live browser: Example page')).toBeNull();
  publish({ ...state, active: false, previewAvailable: true });
  expect(ui.getByText('Browser ready')).toBeTruthy();
  fireEvent.press(ui.getByLabelText('Expand live browser: Example page'));
  expect(props.expand).toHaveBeenCalledTimes(2);
  fireEvent.press(ui.getByLabelText('Hide preview'));
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'dismissPreview' }),
  );
  publish({ ...state, active: false, previewAvailable: false });
  expect(ui.queryByLabelText('Expand live browser: Example page')).toBeNull();
  publish({ ...state, mode: 'human', human: true });
  expect(ui.queryByLabelText('Expand live browser: Example page')).toBeNull();
});

test('foreign messages cannot expire a session; genuine expiry and return preserve their separate meanings', () => {
  const props = {
    origin,
    tab,
    full: true,
    expand: jest.fn(),
    back: jest.fn(),
    onExpired: jest.fn(),
    onReturned: jest.fn(),
  };
  const ui = render(<NativeBrowser {...props} />);
  const view = ui.getByTestId('browser-canvas');
  fireEvent(view, 'message', {
    nativeEvent: {
      url: origin + '/chat/browser/stream/index.html',
      data: packet(state, 'expired'),
    },
  });
  expect(props.onExpired).not.toHaveBeenCalled();
  fireEvent(view, 'message', {
    nativeEvent: { url: uri, data: packet(state, 'returned') },
  });
  expect(props.onReturned).toHaveBeenCalledTimes(1);
  fireEvent(view, 'message', {
    nativeEvent: { url: uri, data: packet(state, 'expired') },
  });
  expect(props.onExpired).toHaveBeenCalledTimes(1);
  act(() => view.props.onError());
  fireEvent.press(ui.getByLabelText('Check connection'));
  expect(mockReload).toHaveBeenCalledTimes(1);
});

test('native owner controls keep input, privacy, handback and local presentation distinct', () => {
  let androidBack: (() => boolean | null | undefined) | undefined;
  const listener = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, callback) => {
      androidBack = callback;
      return { remove: jest.fn() };
    });
  const props = {
    origin,
    tab,
    full: true,
    expand: jest.fn(),
    back: jest.fn(),
    onExpired: jest.fn(),
    onReturned: jest.fn(),
  };
  const ui = render(<NativeBrowser {...props} />);
  const view = () => ui.getByTestId('browser-canvas');
  const publish = (value: BrowserPresentation) =>
    fireEvent(view(), 'message', {
      nativeEvent: { url: uri, data: packet(value) },
    });
  const human = {
    ...state,
    active: false,
    mode: 'human' as const,
    human: true,
    inputReady: true,
    canReturn: true,
  };
  const tap = (label: string) => fireEvent.press(ui.getByLabelText(label));
  publish(human);
  tap('Search or enter address');
  fireEvent.changeText(
    ui.getByLabelText('Browser address or search'),
    'example.org',
  );
  fireEvent(ui.getByLabelText('Browser address or search'), 'submitEditing');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'address', value: 'example.org' }),
  );
  tap('Search or enter address');
  tap('Cancel');
  tap('Search or enter address');
  act(() => {
    androidBack?.();
  });
  expect(ui.queryByLabelText('Browser address or search')).toBeNull();
  tap('Keyboard');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'keyboard' }),
  );
  tap('Tools');
  tap('Let agent observe');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'visibility', mode: 'observe' }),
  );
  publish({ ...human, observing: true });
  tap('Make private');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'visibility', mode: 'private' }),
  );
  for (const [label, key] of [
    ['Back', 'back'],
    ['Reload', 'reload'],
    ['Tab', 'tab'],
    ['Enter', 'enter'],
    ['Escape', 'escape'],
  ] as const) {
    tap(label);
    expect(mockInject).toHaveBeenLastCalledWith(
      commandScript({ action: 'key', key }),
    );
  }
  tap('Dismiss keyboard');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'hideKeyboard' }),
  );
  tap('Zoom to read');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'zoom', enabled: true }),
  );
  expect(
    ui.getByText(
      'Zoomed for reading. Pan to look around; fit the page to interact.',
    ),
  ).toBeTruthy();
  tap('Fit page');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'zoom', enabled: false }),
  );
  tap('Tools');
  tap('Reconnect view');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'reconnect' }),
  );
  tap('Tools');
  tap('Close browser');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'close' }),
  );
  publish({ ...state, state: 'idle', active: false });
  tap('Open browser');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'open' }),
  );
  publish({ ...human, uncertain: true, notice: 'Check the page.' });
  tap('Refresh browser state');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'refresh' }),
  );
  publish({ ...human, playback: 'stalled' });
  tap('Reconnect view');
  publish(human);
  tap('Return to agent');
  expect(mockInject).toHaveBeenLastCalledWith(
    commandScript({ action: 'return' }),
  );
  tap('Tools');
  act(() => {
    androidBack?.();
  });
  expect(ui.queryByText('Browser tools')).toBeNull();
  act(() => {
    androidBack?.();
  });
  expect(props.back).toHaveBeenCalledTimes(1);
  tap('Chat');
  expect(props.back).toHaveBeenCalledTimes(2);
  fireEvent(view(), 'message', { nativeEvent: { url: uri, data: '{}' } });
  expect(ui.getByText('Let’s reconnect')).toBeTruthy();
  listener.mockRestore();
});

test('Android origin-only status requires the exact loaded canvas; iOS retains document-level provenance', () => {
  expect(canvasMessageAllowed(origin, uri, 'android', uri)).toBe(true);
  expect(canvasMessageAllowed(origin, uri, 'ios', uri)).toBe(false);
  expect(canvasMessageAllowed(origin, uri, 'android', null)).toBe(false);
  expect(
    canvasMessageAllowed(
      origin,
      uri,
      'android',
      origin + '/chat/browser/stream/index.html',
    ),
  ).toBe(false);
  expect(
    canvasMessageAllowed('https://foreign.example', uri, 'android', uri),
  ).toBe(false);
  expect(canvasMessageAllowed(uri, uri, 'ios', uri)).toBe(true);
});

test('Android origin-only status reaches the native preview after its canvas load event', () => {
  const platform = Platform.OS;
  Platform.OS = 'android';
  try {
    const props = {
      origin,
      tab,
      full: false,
      expand: jest.fn(),
      back: jest.fn(),
      onExpired: jest.fn(),
      onReturned: jest.fn(),
    };
    const ui = render(<NativeBrowser {...props} />);
    const view = ui.getByTestId('browser-canvas', {
      includeHiddenElements: true,
    });
    fireEvent(view, 'message', {
      nativeEvent: { url: origin, data: packet() },
    });
    expect(ui.queryByLabelText('Expand live browser: Example page')).toBeNull();
    fireEvent(view, 'loadStart', { nativeEvent: { url: uri } });
    fireEvent(view, 'message', {
      nativeEvent: { url: origin, data: packet() },
    });
    expect(ui.getByLabelText('Expand live browser: Example page')).toBeTruthy();
  } finally {
    Platform.OS = platform;
  }
});
