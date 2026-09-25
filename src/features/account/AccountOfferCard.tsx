import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, Button, Card, Icon, spacing } from '@/ui';

/**
 * Delayed account offer (T026): shown only once data worth protecting exists, framed around
 * saving/backing up — never as an initial barrier.
 */
export function AccountOfferCard({ onPress }: { onPress: () => void }) {
  return (
    <Card tone="highlight" testID="account-offer">
      <View style={styles.row}>
        <Icon name="cloud-upload-outline" size={28} color="primary" />
        <View style={styles.text}>
          <AppText variant="bodyStrong">{he.account.offerTitle}</AppText>
          <AppText variant="small" color="textSecondary">
            {he.account.offerBody}
          </AppText>
          <Button
            testID="account-offer-action"
            label={he.account.offerAction}
            variant="secondary"
            onPress={onPress}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  text: { flex: 1, gap: spacing.sm },
});
