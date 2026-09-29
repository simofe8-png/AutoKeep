import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderInstance,
} from 'react-native';

import {
  clampState,
  containSize,
  distance,
  doubleTap,
  IDENTITY,
  midpoint,
  pan,
  pinch,
  type Point,
  type Size,
  type ZoomState,
} from '../zoom';

const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 12;

/** Gesture machinery of one viewer (created once; the pure geometry lives in ../zoom). */
class ZoomController {
  readonly scale = new Animated.Value(1);
  readonly tx = new Animated.Value(0);
  readonly ty = new Animated.Value(0);
  state: ZoomState = IDENTITY;
  viewport: Size = { width: 1, height: 1 };
  content: Size = { width: 1, height: 1 };
  origin: Point = { x: 0, y: 0 };
  onScale: (scale: number) => void = () => undefined;
  readonly responder: PanResponderInstance;

  private start: ZoomState = IDENTITY;
  private startDist = 0;
  private startFocal: Point = { x: 0, y: 0 };
  private startPoint: Point = { x: 0, y: 0 };
  private fingers = 0;
  private moved = false;
  private multi = false;
  private lastTap: { at: number; p: Point } | null = null;

  constructor() {
    this.responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        this.moved = false;
        this.multi = false;
        this.begin(e);
      },
      onPanResponderMove: (e) => this.move(e),
      onPanResponderRelease: (e) => this.release(e),
    });
  }

  /** Touch point relative to the viewport centre (physical coordinates). */
  private pt(t: { pageX: number; pageY: number }): Point {
    return {
      x: t.pageX - this.origin.x - this.viewport.width / 2,
      y: t.pageY - this.origin.y - this.viewport.height / 2,
    };
  }

  private begin(e: GestureResponderEvent) {
    const touches = e.nativeEvent.touches;
    this.start = this.state;
    this.fingers = touches.length;
    if (touches.length >= 2) {
      this.multi = true;
      const a = this.pt(touches[0]);
      const b = this.pt(touches[1]);
      this.startDist = distance(a, b);
      this.startFocal = midpoint(a, b);
    } else if (touches.length === 1) {
      this.startPoint = this.pt(touches[0]);
    }
  }

  private move(e: GestureResponderEvent) {
    const touches = e.nativeEvent.touches;
    if (touches.length !== this.fingers) this.begin(e); // a finger was added or lifted: re-anchor
    if (touches.length >= 2) {
      const a = this.pt(touches[0]);
      const b = this.pt(touches[1]);
      this.moved = true;
      this.apply(
        pinch(this.start, this.startDist, distance(a, b), this.startFocal, midpoint(a, b)),
        false,
      );
    } else if (touches.length === 1) {
      const p = this.pt(touches[0]);
      const dx = p.x - this.startPoint.x;
      const dy = p.y - this.startPoint.y;
      if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) this.moved = true;
      if (this.moved && this.start.scale > 1.01) this.apply(pan(this.start, dx, dy), false);
    }
  }

  private release(e: GestureResponderEvent) {
    if (this.moved || this.multi) {
      this.lastTap = null;
      return;
    }
    const p = this.pt(e.nativeEvent);
    const now = Date.now();
    if (this.lastTap && now - this.lastTap.at < DOUBLE_TAP_MS && distance(this.lastTap.p, p) < 40) {
      this.lastTap = null;
      this.apply(doubleTap(this.state, p), true);
    } else {
      this.lastTap = { at: now, p };
    }
  }

  listen(onScale: (scale: number) => void) {
    this.onScale = onScale;
  }

  setGeometry(viewport: Size, content: Size) {
    this.viewport = viewport;
    this.content = content;
  }

  setOrigin(x: number, y: number) {
    this.origin = { x, y };
  }

  apply(next: ZoomState, animate: boolean) {
    const s = clampState(next, this.viewport, this.content);
    this.state = s;
    this.onScale(s.scale);
    if (!animate) {
      this.scale.setValue(s.scale);
      this.tx.setValue(s.tx);
      this.ty.setValue(s.ty);
      return;
    }
    Animated.parallel([
      Animated.timing(this.scale, { toValue: s.scale, duration: 200, useNativeDriver: false }),
      Animated.timing(this.tx, { toValue: s.tx, duration: 200, useNativeDriver: false }),
      Animated.timing(this.ty, { toValue: s.ty, duration: 200, useNativeDriver: false }),
    ]).start();
  }
}

/**
 * Full-screen image with pinch-to-zoom, drag while zoomed, and double tap to zoom in / back to
 * the fitted view. The original is decoded at full resolution (no downscaling), so small print on
 * a photographed document stays sharp when zoomed. Gestures only transform the image — they
 * never navigate.
 */
export function ZoomableImage({
  uri,
  accessibilityLabel,
  testID,
}: {
  uri: string;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const [zoom] = useState(() => new ZoomController());
  const [viewport, setViewport] = useState<Size>({ width: 1, height: 1 });
  const [natural, setNatural] = useState<Size | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => zoom.listen(setScale), [zoom]);
  useEffect(
    () => zoom.setGeometry(viewport, containSize(viewport, natural)),
    [zoom, viewport, natural],
  );

  return (
    <View
      style={styles.viewport}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setViewport({ width, height });
        e.currentTarget.measureInWindow((x, y) => zoom.setOrigin(x, y));
      }}
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: `${Math.round(scale * 100)}%` }}
      {...zoom.responder.panHandlers}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: zoom.tx }, { translateY: zoom.ty }, { scale: zoom.scale }] },
        ]}
      >
        <Image
          testID={testID ? `${testID}-source` : undefined}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          allowDownscaling={false}
          onLoad={(e) => setNatural({ width: e.source.width, height: e.source.height })}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#000000' },
});
