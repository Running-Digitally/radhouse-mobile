import React from 'react';
import { WebView } from 'react-native-webview';
import { viewerNavigationAllowed, viewerURL } from '../workspace';
/** Mount only after the reviewed session adapter establishes authenticated WebKit cookies. */
export function LiveViewer({
  origin,
  destination,
  authenticated,
  foreground,
}: Readonly<{
  origin: string;
  destination: 'Browser' | 'Terminal';
  authenticated: boolean;
  foreground: boolean;
}>) {
  if (!authenticated || !foreground) {
    return null;
  }
  return (
    <WebView
      source={{ uri: viewerURL(origin, destination) }}
      // WebView opens non-whitelisted origins externally before consulting the
      // callback. Route every URL through our rejecting policy instead.
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={request =>
        viewerNavigationAllowed(request.url, origin)
      }
      sharedCookiesEnabled
      thirdPartyCookiesEnabled={false}
      mixedContentMode="never"
      allowsInlineMediaPlayback
      // The owner explicitly opens Browser. WKWebView otherwise blocks the
      // silent worker-generated live track before it can load its first frame.
      mediaPlaybackRequiresUserAction={destination !== 'Browser'}
      allowFileAccess={false}
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows
      allowsBackForwardNavigationGestures={false}
    />
  );
}
