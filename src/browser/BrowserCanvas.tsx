import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  BrowserCommand,
  BrowserPresentation,
  canvasNavigationAllowed,
  canvasMessageAllowed,
  canvasURL,
  commandScript,
  readPresentation,
} from './protocol';

export type CanvasHandle = { command: (value: BrowserCommand) => void };
export const BrowserCanvas = forwardRef<
  CanvasHandle,
  Readonly<{
    origin: string;
    tab: string;
    full: boolean;
    onState: (value: BrowserPresentation) => void;
    onExpired: () => void;
    onReturned: () => void;
    onFailure: () => void;
  }>
>(function Canvas(
  { origin, tab, full, onState, onExpired, onReturned, onFailure },
  ref,
) {
  const web = useRef<WebView<object>>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedDocument = useRef<string | null>(null);
  const uri = canvasURL(origin, tab);
  function command(value: BrowserCommand) {
    if (value.action === 'refresh' && !loaded) {
      web.current?.reload();
      return;
    }
    web.current?.injectJavaScript(commandScript(value));
  }
  useImperativeHandle(ref, () => ({ command }));
  useEffect(() => {
    if (loaded)
      web.current?.injectJavaScript(
        commandScript({ action: 'present', mode: full ? 'full' : 'preview' }),
      );
  }, [full, loaded]);
  return (
    <View
      style={local.fill}
      pointerEvents={full ? 'auto' : 'none'}
      accessibilityElementsHidden={!full}
      importantForAccessibility={full ? 'auto' : 'no-hide-descendants'}
    >
      <WebView<object>
        ref={web}
        testID="browser-canvas"
        source={{ uri }}
        style={local.fill}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={request =>
          canvasNavigationAllowed(request.url, uri, request.isTopFrame)
        }
        onMessage={event => {
          if (
            !canvasMessageAllowed(
              event.nativeEvent.url,
              uri,
              Platform.OS,
              loadedDocument.current,
            )
          )
            return;
          try {
            const result = readPresentation(event.nativeEvent.data);
            setLoaded(result.value.authenticated);
            if (result.event === 'expired') onExpired();
            else {
              onState(result.value);
              if (result.event === 'returned') onReturned();
            }
          } catch {
            onFailure();
          }
        }}
        onLoadStart={event => {
          loadedDocument.current = event.nativeEvent.url;
          setLoaded(false);
        }}
        onError={() => {
          setLoaded(false);
          onFailure();
        }}
        onHttpError={() => {
          setLoaded(false);
          onFailure();
        }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        mixedContentMode="never"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowFileAccess={false}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows
        allowsBackForwardNavigationGestures={false}
        bounces={false}
      />
    </View>
  );
});
const local = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#F7F5EE' },
});
