import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, Button, Card, Icon, spacing } from '@/ui';

/**
 * Backup reminder (T026, local-first): shown once data worth protecting exists and no backup file
 * was saved yet — never as a barrier.
 */
export function BackupOfferCard({ onPress }: { onPress: () => void }) {
  return (
    <Card tone="highlight" testID="backup-offer">
      <View style={styles.row}>
        <Icon name="content-save-outline" size={28} color="primary" />
        <View style={styles.text}>
          <AppText variant="bodyStrong">{he.backup.offerTitle}</AppText>
          <AppText variant="small" color="textSecondary">
            {he.backup.offerBody}
          </AppText>
          <Button
            testID="backup-offer-action"
            label={he.backup.offerAction}
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
