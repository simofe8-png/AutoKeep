import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import {
  FACT_GROUPS,
  type RegistryFact,
  type VehicleRegistryRecord,
} from '@/providers/registry/vehicleRecord';
import { AppText, Card, Divider, spacing, Stack } from '@/ui';

const HEBREW = /[֐-׿]/;

/** Left-to-right mark: `writingDirection` is iOS-only, so Android needs the mark in the text. */
const LRM = '‎';

/**
 * Codes, tire sizes, masked identifiers, dates and numbers keep their left-to-right reading order
 * inside the RTL layout ("215/45 R16", "••••5581"); Hebrew values are left as they are.
 */
export function displayValue(fact: RegistryFact): string {
  const text = factText(fact);
  return HEBREW.test(text) ? text : `${LRM}${text}${LRM}`;
}

/** Identifiers never shown in full in the normal UI: only the last four characters. */
const SENSITIVE = new Set(['vin', 'engineNumber']);

export function factText(fact: RegistryFact): string {
  if (fact.value === true) return he.vehicleSearch.present;
  if (SENSITIVE.has(fact.key)) {
    const v = String(fact.value);
    return `••••${v.slice(-4)}`;
  }
  if (fact.kind === 'date') {
    const [y, m, d] = String(fact.value).split('-');
    return d ? `${Number(d)}.${Number(m)}.${y}` : `${Number(m)}.${y}`;
  }
  if (typeof fact.value === 'number' && fact.key !== 'modelYear') {
    return [fact.value.toLocaleString('he-IL'), fact.unit].filter(Boolean).join(' ');
  }
  return [String(fact.value), fact.unit].filter(Boolean).join(' ');
}

/**
 * The Ministry of Transport facts of a vehicle, in RTL sections (identity, registration,
 * technical, tires, safety, environment). Only what the source provided: no statistics, safety
 * features only when present, identifiers partially.
 */
export function RegistryFacts({
  record,
  testID = 'vehicle-facts',
}: {
  record: VehicleRegistryRecord;
  testID?: string;
}) {
  return (
    <Stack gap={spacing.md} testID={testID}>
      {FACT_GROUPS.map((g) => {
        const facts = record.facts.filter((f) => f.group === g);
        if (facts.length === 0) return null;
        return (
          <Card key={g} testID={`vehicle-facts-${g}`}>
            <Stack gap={spacing.xs}>
              <AppText variant="bodyStrong" accessibilityRole="header">
                {he.vehicleSearch.groups[g]}
              </AppText>
              {facts.map((fact, i) => (
                <View key={fact.key}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.row} testID={`vehicle-fact-${fact.key}`}>
                    <AppText variant="small" color="textSecondary" style={styles.label}>
                      {he.vehicleSearch.facts[fact.key] ?? fact.key}
                    </AppText>
                    <AppText variant="smallStrong" style={styles.value}>
                      {displayValue(fact)}
                    </AppText>
                  </View>
                </View>
              ))}
            </Stack>
          </Card>
        );
      })}
      <AppText variant="caption" color="textMuted">
        {he.vehicleSearch.source}
      </AppText>
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxs,
  },
  label: { flex: 1 },
  value: { flexShrink: 1 },
});
