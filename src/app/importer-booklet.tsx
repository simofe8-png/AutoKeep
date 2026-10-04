import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { importerBookletFor } from '@/features/maintenance/importerBooklets';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { EmptyState, Screen } from '@/ui';

/**
 * The importer's booklet library, inside the app — for phones without a browser (device check
 * 2026-10-04: Chrome disabled). The owner browses it; AutoKeep does not read or store the site.
 * Only the importer's own host is shown (no other site can be opened through this screen).
 */
export default function ImporterBookletScreen() {
  const { make } = useLocalSearchParams<{ make?: string }>();
  const booklet = make ? importerBookletFor(make) : null;
  const host = booklet ? new URL(booklet.url).host : null;
  return (
    <Screen
      testID="screen-importer-booklet"
      scroll={false}
      header={<ScreenHeader title={he.manualItem.importerTitle} />}
    >
      {booklet && host ? (
        <View style={styles.web}>
          <WebView
            testID="importer-booklet-webview"
            source={{ uri: booklet.url }}
            originWhitelist={['https://*']}
            onShouldStartLoadWithRequest={(r) => {
              try {
                const h = new URL(r.url).host;
                // The library and its viewer (FlippingBook) only.
                return h === host || h.endsWith('.flippingbook.com') || h.endsWith(`.${host}`);
              } catch {
                return false;
              }
            }}
            setSupportMultipleWindows={false}
            incognito
          />
        </View>
      ) : (
        <EmptyState icon="book-off-outline" title={he.states.genericErrorTitle} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, marginHorizontal: -16 },
});
