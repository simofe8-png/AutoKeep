import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { uploadLog } from './devLog';
import { ocrBridge } from './ocrBridge';
import { pdfBridge, type PdfBridge } from './pdfBridge';

/**
 * Hidden hosts of the on-device readers: the PDF reader (D-A1) and the booklet-photo reader (OCR,
 * owner decision 2026-10-04). Mounted once in the app providers; each renders its WebView only
 * while its bridge has work. The pages are local (bundled assets, no network: their CSP and the
 * navigation guard below), JavaScript runs only inside them, and nothing is cached or stored by
 * the WebView.
 */
function pageLoader(load: () => Promise<Asset[]>, name: string) {
  let htmlLoad: Promise<string> | null = null;
  return (): Promise<string> => {
    if (!htmlLoad) {
      htmlLoad = (async () => {
        const [asset] = await load();
        if (!asset.localUri) throw new Error(`the ${name} page is unavailable`);
        return new File(asset.localUri).text();
      })();
      htmlLoad.catch(() => {
        htmlLoad = null;
      });
    }
    return htmlLoad;
  };
}

const pdfPage = pageLoader(
  () => Asset.loadAsync(require('../../../../assets/pdfjs/pdf-reader.html')),
  'PDF reader',
);
const ocrPage = pageLoader(
  () => Asset.loadAsync(require('../../../../assets/ocr/ocr-reader.html')),
  'photo reader',
);

function ReaderHost({
  bridge,
  page,
  name,
  testID,
}: {
  bridge: PdfBridge;
  page: () => Promise<string>;
  name: string;
  testID: string;
}) {
  const [active, setActive] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const ref = useRef<WebView>(null);

  useEffect(() => bridge.subscribe(setActive), [bridge]);

  useEffect(() => {
    if (!active || html) return;
    let live = true;
    page().then(
      (h) => {
        uploadLog(`${name}: page loaded`, { chars: h.length });
        if (live) setHtml(h);
      },
      (e: unknown) => {
        uploadLog(`${name}: page load failed`, { error: String(e).slice(0, 160) });
        bridge.fail(String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [active, html, bridge, page, name]);

  useEffect(() => {
    if (!active || !html) return;
    bridge.attach({ inject: (js) => ref.current?.injectJavaScript(js) });
    return () => bridge.detach();
  }, [active, html, bridge]);

  if (!active || !html) return null;
  return (
    <View
      style={styles.hidden}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
    >
      <WebView
        ref={ref}
        testID={testID}
        source={{ html }}
        originWhitelist={['about:*']}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith('about:')}
        onMessage={(e) => bridge.onMessage(e.nativeEvent.data)}
        onContentProcessDidTerminate={() => bridge.fail(`the ${name} stopped`)}
        onRenderProcessGone={() => bridge.fail(`the ${name} stopped`)}
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

export function PdfReaderHost() {
  return (
    <>
      <ReaderHost bridge={pdfBridge} page={pdfPage} name="pdf reader" testID="pdf-reader-webview" />
      <ReaderHost
        bridge={ocrBridge}
        page={ocrPage}
        name="photo reader"
        testID="ocr-reader-webview"
      />
    </>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
});
