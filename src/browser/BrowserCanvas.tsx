import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { NativeModules, Platform, StyleSheet, View } from 'react-native';
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
  const androidViewTag = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedDocument = useRef<string | null>(null);
  const uri = canvasURL(origin, tab);
  function command(value: BrowserCommand) {
    if (value.action === 'refresh' && !loaded) {
      web.current?.reload();
      return;
    }
    // A native toolbar tap is not a tap inside the WebView. Transfer native
    // focus before the guarded viewer focuses its existing input/IME field.
    if (value.action === 'keyboard' && full && loaded) {
      if (Platform.OS === 'android') {
        const tag = androidViewTag.current;
        if (tag !== null) NativeModules.RadhouseBrowserKeyboard.show(tag);
        return;
      }
      web.current?.requestFocus();
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
            if (
              'target' in event.nativeEvent &&
              typeof event.nativeEvent.target === 'number'
            ) {
              androidViewTag.current = event.nativeEvent.target;
            }
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
          androidViewTag.current = null;
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
        keyboardDisplayRequiresUserAction={false}
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
