import React from 'react';
import { render } from '@testing-library/react-native';
import { LiveViewer } from '../src/components/LiveViewer';
import { viewerNavigationAllowed, viewerURL } from '../src/workspace';
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
const origin = 'https://assistant.example.test';
test('viewer requires an authenticated foreground session', () => {
  expect(
    render(
      <LiveViewer
        origin={origin}
        destination="Browser"
        authenticated={false}
        foreground
      />,
    ).toJSON(),
  ).toBeNull();
  expect(
    render(
      <LiveViewer
        origin={origin}
        destination="Terminal"
        authenticated
        foreground={false}
      />,
    ).toJSON(),
  ).toBeNull();
  const ui = render(
    <LiveViewer
      origin={origin}
      destination="Browser"
      authenticated
      foreground
    />,
  );
  const tree = ui.toJSON() as unknown as {
    props: {
      source: { uri: string };
      onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
    };
  };
  expect(tree.props.source.uri).toBe(origin + '/browser');
  expect(
    tree.props.onShouldStartLoadWithRequest({
      url: origin + '/chat/browser/stream/',
    }),
  ).toBe(true);
  expect(
    tree.props.onShouldStartLoadWithRequest({ url: 'https://foreign.invalid' }),
  ).toBe(false);
});
test.each([
  'http://assistant.example.test',
  origin + '/path',
  origin + '?key=x',
  'https://user:pass@assistant.example.test',
])('refuses an unsafe application origin %s', value => {
  expect(() => viewerURL(value, 'Browser')).toThrow();
});
test('terminal route is fixed; credentials and arbitrary schemes cannot navigate', () => {
  expect(viewerURL(origin, 'Terminal')).toBe(origin + '/terminal');
  expect(
    viewerNavigationAllowed(['javascript', 'alert(1)'].join(':'), origin),
  ).toBe(false);
  expect(
    viewerNavigationAllowed('https://user:pass@assistant.example.test', origin),
  ).toBe(false);
  expect(viewerNavigationAllowed('not a URL', origin)).toBe(false);
});
