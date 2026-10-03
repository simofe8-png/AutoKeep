import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { pdfBridge } from './pdfBridge';

/**
 * Hidden host of the on-device PDF reader page (D-A1). Mounted once in the app providers; it
 * renders the WebView only while the bridge has work. The page is local (bundled asset, no
 * network: its CSP and the navigation guard below), JavaScript runs only inside it, and nothing
 * is cached or stored by the WebView.
 */
let htmlLoad: Promise<string> | null = null;

function readerHtml(): Promise<string> {
  if (!htmlLoad) {
    htmlLoad = (async () => {
      const [asset] = await Asset.loadAsync(require('../../../../assets/pdfjs/pdf-reader.html'));
      if (!asset.localUri) throw new Error('the PDF reader page is unavailable');
      return new File(asset.localUri).text();
    })();
    htmlLoad.catch(() => {
      htmlLoad = null;
    });
  }
  return htmlLoad;
}

export function PdfReaderHost() {
  const [active, setActive] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const ref = useRef<WebView>(null);

  useEffect(() => pdfBridge.subscribe(setActive), []);

  useEffect(() => {
    if (!active || html) return;
    let live = true;
    readerHtml().then(
      (h) => live && setHtml(h),
      (e: unknown) => pdfBridge.fail(String(e)),
    );
    return () => {
      live = false;
    };
  }, [active, html]);

  useEffect(() => {
    if (!active || !html) return;
    pdfBridge.attach({ inject: (js) => ref.current?.injectJavaScript(js) });
    return () => pdfBridge.detach();
  }, [active, html]);

  if (!active || !html) return null;
  return (
    <View
      style={styles.hidden}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
    >
      <WebView
        ref={ref}
        testID="pdf-reader-webview"
        source={{ html }}
        originWhitelist={['about:*']}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith('about:')}
        onMessage={(e) => pdfBridge.onMessage(e.nativeEvent.data)}
        onContentProcessDidTerminate={() => pdfBridge.fail('the PDF reader stopped')}
        onRenderProcessGone={() => pdfBridge.fail('the PDF reader stopped')}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        mixedContentMode="never"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
});
