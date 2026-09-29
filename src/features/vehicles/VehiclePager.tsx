import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type PanResponderInstance,
} from 'react-native';

import { he } from '@/i18n/he';
import { APP_DIRECTION, colors, spacing } from '@/ui';

import { cardOffset, resistedDrag, rowTranslate, settleIndex } from './pager';
import type { VehicleSummary } from './types';

const RTL = APP_DIRECTION === 'rtl';

interface PagerLive {
  index: number;
  count: number;
  width: number;
  vehicles: readonly VehicleSummary[];
  onSelect: (id: string) => void;
  onMovingChange?: (moving: boolean) => void;
}

/** Gesture machinery of the pager (created once; the paging rules live in ./pager). */
class PagerController {
  readonly x = new Animated.Value(0);
  live: PagerLive = { index: 0, count: 0, width: 0, vehicles: [], onSelect: () => undefined };
  readonly responder: PanResponderInstance = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      this.live.count > 1 && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => this.live.onMovingChange?.(true),
    onPanResponderMove: (_, g) => {
      const { index: i, count: n, width: w } = this.live;
      this.x.setValue(rowTranslate(i, w, RTL, resistedDrag(i, n, g.dx, RTL)));
    },
    onPanResponderRelease: (_, g) => this.settle(g.dx, g.vx),
    onPanResponderTerminate: (_, g) => this.settle(g.dx, g.vx),
  });

  update(live: PagerLive) {
    this.live = live;
  }

  private settle(dx: number, vx: number) {
    const { index: i, count: n, width: w, vehicles: vs } = this.live;
    const target = settleIndex(i, n, dx, vx, w, RTL);
    Animated.timing(this.x, {
      toValue: rowTranslate(target, w, RTL),
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      // Card and data switch together: select first, then reveal the data again.
      if (target !== i) this.live.onSelect(vs[target].id);
      this.live.onMovingChange?.(false);
    });
  }
}

/**
 * Home vehicle cards, one per vehicle, switched by a horizontal swipe (payment-card style). The
 * card shown is always the active vehicle's: a swipe only reports the vehicle it settled on
 * (`onSelect`), and the parent makes it active — so the rest of Home switches in the same render.
 * While a card is being dragged, `onMovingChange(true)` lets Home hide its vehicle-specific data,
 * so one vehicle's image is never shown with another vehicle's data. One vehicle: a plain card,
 * no swipe, no dots.
 */
export function VehiclePager({
  vehicles,
  activeId,
  onSelect,
  onMovingChange,
  renderCard,
}: {
  vehicles: readonly VehicleSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onMovingChange?: (moving: boolean) => void;
  renderCard: (v: VehicleSummary) => ReactNode;
}) {
  const count = vehicles.length;
  const index = Math.max(
    0,
    vehicles.findIndex((v) => v.id === activeId),
  );
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [pager] = useState(() => new PagerController());

  // Latest props for the gesture handlers (never read during render).
  useEffect(() => {
    pager.update({ index, count, width, vehicles, onSelect, onMovingChange });
  });
  // The shown card follows the active vehicle (also when it is changed elsewhere).
  useEffect(() => {
    pager.x.setValue(rowTranslate(index, width, RTL));
  }, [pager, index, width]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  // The card area takes the active card's height (no gap under a shorter card); it changes only
  // when a swipe settles, while Home's vehicle data is hidden anyway.
  const height = heights[vehicles[index]?.id ?? ''] ?? 0;

  if (count <= 1) {
    return (
      <View testID="vehicle-pager">
        <View testID="home-active-vehicle">{vehicles[0] ? renderCard(vehicles[0]) : null}</View>
      </View>
    );
  }

  return (
    <View
      testID="vehicle-pager"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={he.activeVehicle.pagerLabel(index + 1, count)}
      accessibilityActions={[
        { name: 'increment', label: he.activeVehicle.nextVehicle },
        { name: 'decrement', label: he.activeVehicle.previousVehicle },
      ]}
      onAccessibilityAction={(e) => {
        const step = e.nativeEvent.actionName === 'increment' ? 1 : -1;
        const target = Math.max(0, Math.min(count - 1, index + step));
        if (target !== index) onSelect(vehicles[target].id);
      }}
    >
      <View
        style={[styles.viewport, { height: height || undefined }]}
        onLayout={onLayout}
        {...pager.responder.panHandlers}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: pager.x }] }]}>
          {vehicles.map((v, i) => (
            <View
              key={v.id}
              testID={i === index ? 'home-active-vehicle' : `vehicle-card-${v.id}`}
              importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
              style={[
                styles.card,
                {
                  width: width || undefined,
                  transform: [{ translateX: cardOffset(i, width, RTL) }],
                },
              ]}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                setHeights((prev) => (prev[v.id] === h ? prev : { ...prev, [v.id]: h }));
              }}
            >
              {renderCard(v)}
            </View>
          ))}
        </Animated.View>
      </View>
      <View style={styles.dots} testID="vehicle-pager-dots">
        {vehicles.map((v, i) => (
          <View
            key={v.id}
            testID={i === index ? 'vehicle-pager-dot-active' : undefined}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden', minHeight: 1 },
  card: { position: 'absolute', top: 0, start: 0 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.primary },
});
