// src/app_core/components/SafetyWheel.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

const { width } = Dimensions.get("window");
export const STANDARD_WHEEL_SIZE = Math.min(width * 0.96, 430);
const DEFAULT_WHEEL_SIZE = STANDARD_WHEEL_SIZE;
const WHEEL_HINT_STORAGE_KEY = "laufbuddy.wheelHintLearning.v1";
const WHEEL_HINT_HIDE_AFTER_ROTATIONS = 4;
const WHEEL_HINT_RESHOW_AFTER_MS = 14 * 24 * 60 * 60 * 1000;


export type SafetyWheelIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

export type SafetyWheelItem = {
  key: string;
  label: string;
  icon: SafetyWheelIcon;
  action: () => void;
};

type SafetyWheelProps = {
  items: SafetyWheelItem[];
  statusLabel: string;
  statusSubline: string;
  statusColor: string;
  secondaryStatusLine: string;
  bottomHint?: string;
  wheelSize?: number;
  centerStatusContent?: React.ReactNode;
  centerConfirmContent?: React.ReactNode;
  centerPressEnabled?: boolean;
  centerPressMode?: 'confirm' | 'direct';
  captureVerticalGestures?: boolean;
  onSelectedItemChange?: (itemKey: string) => void;
};

type SwipeHintShadowProps = {
  side: "left" | "right";
  opacity: Animated.AnimatedInterpolation<number>;
  translateX: Animated.AnimatedInterpolation<number>;
  scale: Animated.AnimatedInterpolation<number>;
};

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export function SafetyWheel({
  items,
  statusLabel,
  statusSubline,
  statusColor,
  secondaryStatusLine,
  bottomHint = "Wischen zum Drehen",
  wheelSize,
  centerStatusContent,
  centerConfirmContent,
  centerPressEnabled = true,
  centerPressMode = 'confirm',
  captureVerticalGestures = false,
  onSelectedItemChange,
}: SafetyWheelProps) {
  const safeItems = items.length > 0 ? items : [];
  const resolvedWheelSize = wheelSize ?? DEFAULT_WHEEL_SIZE;
  const wheelScale = resolvedWheelSize / DEFAULT_WHEEL_SIZE;
  const segmentLabelSize = Math.round(86 * wheelScale);
  const lockedIconSize = Math.max(26, Math.round(40 * wheelScale));
  const idleIconSize = Math.max(22, Math.round(34 * wheelScale));
  const centerWidth = Math.max(112, Math.round(150 * wheelScale));
  const centerMinHeight = Math.max(82, Math.round(104 * wheelScale));
  const [wheelStep, setWheelStep] = useState(0);
  const [centerMode, setCenterMode] = useState<"status" | "confirm">("status");
  const [isWheelMoving, setWheelMoving] = useState(false);
  const [shouldShowBottomHint, setShouldShowBottomHint] = useState(true);

  const rotationAnim = useRef(new Animated.Value(0)).current;
  const wheelBreathAnim = useRef(new Animated.Value(0)).current;
  const swipeHintAnim = useRef(new Animated.Value(0)).current;
  const lastSnapRef = useRef(0);
  const wheelHintRotationCountRef = useRef(0);
  const centerResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const itemCount = safeItems.length;
  const activeWheelIndex =
    itemCount === 0 ? 0 : ((wheelStep % itemCount) + itemCount) % itemCount;
  const selectedItemIndex =
    itemCount === 0 ? 0 : ((-activeWheelIndex % itemCount) + itemCount) % itemCount;
  const selectedWheelItem = safeItems[selectedItemIndex];
  const segmentStepDegrees = itemCount === 0 ? 0 : 360 / itemCount;
  const centerIsActionable = centerPressEnabled && centerMode === "status";
  const centerIsConfirming = centerPressEnabled && centerMode === "confirm";

  useEffect(() => {
    let isMounted = true;

    async function loadWheelHintLearning() {
      try {
        const rawValue = await AsyncStorage.getItem(WHEEL_HINT_STORAGE_KEY);
        const parsedValue = rawValue ? JSON.parse(rawValue) : null;
        const rotationCount =
          typeof parsedValue?.rotationCount === "number"
            ? parsedValue.rotationCount
            : 0;
        const lastRotationAt =
          typeof parsedValue?.lastRotationAt === "number"
            ? parsedValue.lastRotationAt
            : null;

        const now = Date.now();
        const learnedRecently =
          rotationCount >= WHEEL_HINT_HIDE_AFTER_ROTATIONS &&
          lastRotationAt !== null &&
          now - lastRotationAt < WHEEL_HINT_RESHOW_AFTER_MS;

        wheelHintRotationCountRef.current = learnedRecently ? rotationCount : 0;

        if (isMounted) {
          setShouldShowBottomHint(!learnedRecently);
        }
      } catch {
        if (isMounted) {
          setShouldShowBottomHint(true);
        }
      }
    }

    void loadWheelHintLearning();

    return () => {
      isMounted = false;
    };
  }, []);

  const markWheelHintUsed = useCallback(() => {
    const now = Date.now();
    const nextRotationCount = Math.min(
      WHEEL_HINT_HIDE_AFTER_ROTATIONS,
      wheelHintRotationCountRef.current + 1,
    );

    wheelHintRotationCountRef.current = nextRotationCount;
    setShouldShowBottomHint(nextRotationCount < WHEEL_HINT_HIDE_AFTER_ROTATIONS);

    void AsyncStorage.setItem(
      WHEEL_HINT_STORAGE_KEY,
      JSON.stringify({
        rotationCount: nextRotationCount,
        lastRotationAt: now,
      }),
    ).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedWheelItem || !onSelectedItemChange) {
      return;
    }

    onSelectedItemChange(selectedWheelItem.key);
  }, [onSelectedItemChange, selectedWheelItem]);

  useEffect(() => {
    Animated.timing(rotationAnim, {
      toValue: wheelStep,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [rotationAnim, wheelStep]);

  const wheelRotation = rotationAnim.interpolate({
    inputRange: [-20, 20],
    outputRange: [
      `${-20 * segmentStepDegrees}deg`,
      `${20 * segmentStepDegrees}deg`,
    ],
  });

  const iconCounterRotation = rotationAnim.interpolate({
    inputRange: [-20, 20],
    outputRange: [
      `${20 * segmentStepDegrees}deg`,
      `${-20 * segmentStepDegrees}deg`,
    ],
  });

  const wheelBreathScale = wheelBreathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018],
  });

  const wheelBreathLift = wheelBreathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });

  const swipeHintOpacity = swipeHintAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.18, 0.48, 0.18],
  });

  const swipeHintScale = swipeHintAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.96, 1.04, 0.96],
  });

  const swipeHintTranslateX = swipeHintAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 5, 0],
  });

  useEffect(() => {
    const breathAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(wheelBreathAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(wheelBreathAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    breathAnimation.start();

    return () => {
      breathAnimation.stop();
    };
  }, [wheelBreathAnim]);

  useEffect(() => {
    const swipeHintAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(swipeHintAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(swipeHintAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    swipeHintAnimation.start();

    return () => {
      swipeHintAnimation.stop();
    };
  }, [swipeHintAnim]);

  const resetCenterModeLater = useCallback(() => {
    if (centerResetTimerRef.current) {
      clearTimeout(centerResetTimerRef.current);
    }

    centerResetTimerRef.current = setTimeout(() => {
      setCenterMode("status");
      centerResetTimerRef.current = null;
    }, 2500);
  }, []);

  const enterConfirmMode = useCallback(() => {
    setCenterMode("confirm");
    resetCenterModeLater();
  }, [resetCenterModeLater]);

  const markWheelMoving = useCallback(() => {
    setWheelMoving(true);

    if (wheelStopTimerRef.current) {
      clearTimeout(wheelStopTimerRef.current);
    }

    wheelStopTimerRef.current = setTimeout(() => {
      setWheelMoving(false);
      wheelStopTimerRef.current = null;
    }, 320);
  }, []);

  const confirmSelectedWheelItem = useCallback(() => {
    if (!selectedWheelItem) {
      return;
    }

    if (centerPressMode === 'direct') {
      if (centerResetTimerRef.current) {
        clearTimeout(centerResetTimerRef.current);
        centerResetTimerRef.current = null;
      }

      setCenterMode("status");
      selectedWheelItem.action();
      return;
    }

    if (centerMode !== "confirm") {
      enterConfirmMode();
      return;
    }

    if (centerResetTimerRef.current) {
      clearTimeout(centerResetTimerRef.current);
      centerResetTimerRef.current = null;
    }

    setCenterMode("status");
    selectedWheelItem.action();
  }, [centerMode, centerPressMode, enterConfirmMode, selectedWheelItem]);

  useEffect(() => {
    return () => {
      if (centerResetTimerRef.current) {
        clearTimeout(centerResetTimerRef.current);
      }

      if (wheelStopTimerRef.current) {
        clearTimeout(wheelStopTimerRef.current);
      }
    };
  }, []);

  const rotateWheel = useCallback(
    (direction: number) => {
      if (itemCount < 2) {
        return;
      }

      const now = Date.now();

      if (now - lastSnapRef.current < 280) {
        return;
      }

      lastSnapRef.current = now;
      Vibration.vibrate(18);
      markWheelMoving();
      markWheelHintUsed();
      enterConfirmMode();
      setWheelStep((currentStep) => currentStep + direction);
    },
    [enterConfirmMode, itemCount, markWheelHintUsed, markWheelMoving],
  );

  const screenPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          captureVerticalGestures &&
          Math.abs(gestureState.dy) > 6 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.2,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 28 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.2,
        onPanResponderMove: (_, gestureState) => {
          const isLeftHalf = gestureState.moveX < width / 2;

          if (Math.abs(gestureState.dy) < 58) {
            return;
          }

          if (gestureState.dy < -58) {
            rotateWheel(isLeftHalf ? 1 : -1);
          }

          if (gestureState.dy > 58) {
            rotateWheel(isLeftHalf ? -1 : 1);
          }
        },
      }),
    [captureVerticalGestures, rotateWheel],
  );

  if (!selectedWheelItem) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Keine Menüpunkte vorhanden</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} {...screenPanResponder.panHandlers}>
      <View
        style={[
          styles.wheelArea,
          { width: resolvedWheelSize, height: resolvedWheelSize },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeHintLayer,
            {
              opacity: centerMode === "status" ? 1 : 0,
            },
          ]}
        >
          <SwipeHintShadow
            side="left"
            opacity={swipeHintOpacity}
            translateX={swipeHintTranslateX}
            scale={swipeHintScale}
          />
          <SwipeHintShadow
            side="right"
            opacity={swipeHintOpacity}
            translateX={swipeHintTranslateX}
            scale={swipeHintScale}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.rotatingWheelLayer,
            {
              transform: [
                { translateY: wheelBreathLift },
                { scale: wheelBreathScale },
                { rotate: wheelRotation },
              ],
            },
          ]}
        >
          <SvgWheel
            items={safeItems}
            selectedItemIndex={selectedItemIndex}
            isWheelMoving={isWheelMoving}
            wheelSize={resolvedWheelSize}
          />

          {safeItems.map((item, index) => {
            const isLockedIn = index === selectedItemIndex;
            const SegmentIcon = item.icon;
            const iconPosition = getIconPositionStyle(
              index,
              itemCount,
              resolvedWheelSize,
              segmentLabelSize,
            );

            return (
              <Pressable
                key={item.key}
                onPress={item.action}
                style={[
                  styles.segmentLabel,
                  {
                    width: segmentLabelSize,
                    minHeight: segmentLabelSize,
                  },
                  iconPosition,
                ]}
              >
                <Animated.View
                  style={{
                    transform: [
                      { rotate: iconCounterRotation },
                      { scale: isWheelMoving && isLockedIn ? 1.18 : 1 },
                    ],
                  }}
                >
                  <SegmentIcon
                    size={isLockedIn ? lockedIconSize : idleIconSize}
                    color={isLockedIn ? "#FFFFFF" : "#2F7DA8"}
                    strokeWidth={isLockedIn ? 3.0 : 2.5}
                  />
                </Animated.View>
              </Pressable>
            );
          })}
        </Animated.View>

        <Pressable
          onPress={centerPressEnabled ? confirmSelectedWheelItem : undefined}
          style={[
            styles.centerStatus,
            {
              width: centerWidth,
              minHeight: centerMinHeight,
              borderRadius: Math.max(28, Math.round(36 * wheelScale)),
              paddingHorizontal: Math.max(10, Math.round(14 * wheelScale)),
              borderColor:
                centerMode === "confirm" ? "#34A6D8" : statusColor,
            },
            centerIsConfirming ? styles.centerConfirm : null,
            centerIsActionable ? styles.centerActionable : styles.centerPassive,
          ]}
        >
          {centerMode === "confirm" ? (
            centerConfirmContent ?? (
              <>
                <Text style={styles.centerConfirmEyebrow}>AUSWAHL</Text>
                <Text style={styles.centerConfirmLabel}>{selectedWheelItem.label}</Text>
                <Text style={styles.centerConfirmSubline}>Tippen zum Bestätigen</Text>
              </>
            )
          ) : (
            centerStatusContent ?? (
              <>
                <Text style={[styles.statusLabel, { color: statusColor }]}>
                  {statusLabel}
                </Text>
                <Text style={styles.statusSubline}>{statusSubline}</Text>
                <Text style={styles.secondaryStatusLine}>{secondaryStatusLine}</Text>
                <Text style={styles.centerTapHint}>
                  Tippe hier für {selectedWheelItem.label}
                </Text>
              </>
            )
          )}
        </Pressable>
      </View>

      {bottomHint && shouldShowBottomHint ? (
        <View style={styles.thumbHintRow}>
          <Text style={styles.thumbHint}>{bottomHint}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SwipeHintShadow({
  side,
  opacity,
  translateX,
  scale,
}: SwipeHintShadowProps) {
  const isLeft = side === "left";

  return (
    <Animated.View
      style={[
        styles.swipeHintShadow,
        isLeft ? styles.swipeHintShadowLeft : styles.swipeHintShadowRight,
        {
          opacity,
          transform: [
            { translateX: isLeft ? Animated.multiply(translateX, -1) : translateX },
            { scale },
            { scaleX: isLeft ? -1 : 1 },
          ],
        },
      ]}
    >
      <Svg width={82} height={180} viewBox="0 0 82 180">
        <Defs>
          <LinearGradient id={`swipeGlow-${side}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.08" />
            <Stop offset="48%" stopColor="#70D6FF" stopOpacity="0.62" />
            <Stop offset="100%" stopColor="#1C6D95" stopOpacity="0.08" />
          </LinearGradient>
        </Defs>

        <Path
          d="M30 22 C66 58 66 122 30 158"
          stroke={`url(#swipeGlow-${side})`}
          strokeWidth={18}
          strokeLinecap="round"
          fill="transparent"
          opacity={0.55}
        />

        <Path
          d="M30 22 C66 58 66 122 30 158"
          stroke="#DFF8FF"
          strokeWidth={4}
          strokeLinecap="round"
          fill="transparent"
          opacity={0.36}
        />

        <Path
          d="M31 156 L48 146 L48 167 Z"
          fill="#DFF8FF"
          opacity={0.34}
        />
      </Svg>
    </Animated.View>
  );
}

function getIconPositionStyle(
  index: number,
  itemCount: number,
  wheelSize: number,
  labelSize: number,
) {
  const radius = wheelSize * 0.34;
  const center = wheelSize / 2;
  const segmentAngle = 360 / itemCount;
  const angle = index * segmentAngle;

  const point = polarToCartesian(center, center, radius, angle);

  return {
    left: point.x - labelSize / 2,
    top: point.y - labelSize / 2,
  };
}

function SvgWheel({
  items,
  selectedItemIndex,
  isWheelMoving,
  wheelSize,
}: {
  items: SafetyWheelItem[];
  selectedItemIndex: number;
  isWheelMoving: boolean;
  wheelSize: number;
}) {
  const size = wheelSize;
  const canvasSize = size + 56;
  const center = canvasSize / 2;

  const outerRadius = canvasSize * 0.42;
  const innerRadius = canvasSize * 0.28;
  const ringRadius = (outerRadius + innerRadius) / 2;
  const ringWidth = outerRadius - innerRadius;
  const segmentAngle = 360 / items.length;

  const buildArcPath = useCallback(
    (radius: number, startAngle: number, endAngle: number) => {
      const startPoint = polarToCartesian(center, center, radius, endAngle);
      const endPoint = polarToCartesian(center, center, radius, startAngle);
      const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

      return [
        "M",
        startPoint.x,
        startPoint.y,
        "A",
        radius,
        radius,
        0,
        largeArcFlag,
        0,
        endPoint.x,
        endPoint.y,
      ].join(" ");
    },
    [center],
  );

  const segments = useMemo(() => {
    return items.map((_, positionIndex) => {
      const gap = items.length <= 3 ? 12 : 9.5;
      const halfSegmentAngle = segmentAngle / 2;
      const startAngle = positionIndex * segmentAngle - halfSegmentAngle + gap;
      const endAngle = positionIndex * segmentAngle + halfSegmentAngle - gap;

      return {
        positionIndex,
        mainPath: buildArcPath(ringRadius, startAngle, endAngle),
        highlightPath: buildArcPath(
          ringRadius - ringWidth * 0.24,
          startAngle + 3,
          endAngle - 3,
        ),
        outerLipPath: buildArcPath(
          ringRadius + ringWidth * 0.33,
          startAngle + 4,
          endAngle - 4,
        ),
      };
    });
  }, [buildArcPath, items, ringRadius, ringWidth, segmentAngle]);

  return (
    <View style={[styles.svgWrapper, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${canvasSize} ${canvasSize}`}>
        <Defs>
          <RadialGradient id="outerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.96" />
            <Stop offset="58%" stopColor="#D8F4FF" stopOpacity="0.54" />
            <Stop offset="100%" stopColor="#35A9D8" stopOpacity="0.18" />
          </RadialGradient>

          <LinearGradient id="segmentActive" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#E4FBFF" stopOpacity="1" />
            <Stop offset="28%" stopColor="#67C7EA" stopOpacity="1" />
            <Stop offset="62%" stopColor="#176C9E" stopOpacity="1" />
            <Stop offset="100%" stopColor="#062A43" stopOpacity="1" />
          </LinearGradient>

          <LinearGradient id="segmentIdle" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#F7FDFF" stopOpacity="1" />
            <Stop offset="52%" stopColor="#B9E8F8" stopOpacity="0.96" />
            <Stop offset="100%" stopColor="#70BEDD" stopOpacity="0.92" />
          </LinearGradient>

          <LinearGradient id="segmentDepth" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#104D70" stopOpacity="0.70" />
            <Stop offset="100%" stopColor="#031B2B" stopOpacity="0.92" />
          </LinearGradient>

          <LinearGradient id="segmentLip" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="100%" stopColor="#7DD6F1" stopOpacity="0.20" />
          </LinearGradient>
        </Defs>

        <Circle cx={center} cy={center} r={outerRadius + 28} fill="url(#outerGlow)" />

        <Circle
          cx={center}
          cy={center}
          r={outerRadius + 5}
          stroke="#287FA8"
          strokeWidth={10}
          opacity={0.22}
          fill="transparent"
        />

        <Circle
          cx={center}
          cy={center}
          r={innerRadius - 8}
          stroke="#D9F7FF"
          strokeWidth={10}
          opacity={0.74}
          fill="transparent"
        />

        <G>
          {segments.map((segment) => {
            const itemIndex = segment.positionIndex;
            const isActive = itemIndex === selectedItemIndex;
            const activeTransform =
              isWheelMoving && isActive
                ? `translate(${center} ${center - 8}) scale(1.10) translate(${-center} ${-center})`
                : undefined;

            return (
              <G key={`${segment.positionIndex}-${items[itemIndex].key}`}>
                <Path
                  d={segment.mainPath}
                  stroke="url(#segmentDepth)"
                  strokeWidth={ringWidth + (isActive ? 18 : 8)}
                  strokeLinecap="round"
                  opacity={isActive ? 0.56 : 0.28}
                  fill="transparent"
                  transform={
                    isWheelMoving && isActive
                      ? `translate(${center} ${center + 12}) scale(1.14) translate(${-center} ${-center})`
                      : undefined
                  }
                />

                <Path
                  d={segment.mainPath}
                  stroke={isActive ? "url(#segmentActive)" : "url(#segmentIdle)"}
                  strokeWidth={ringWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={isActive ? 1 : 0.94}
                  fill="transparent"
                  transform={activeTransform}
                />

                <Path
                  d={segment.outerLipPath}
                  stroke="#E9FBFF"
                  strokeWidth={isActive ? 5 : 3}
                  strokeLinecap="round"
                  opacity={isActive ? 0.92 : 0.48}
                  fill="transparent"
                  transform={activeTransform}
                />

                <Path
                  d={segment.highlightPath}
                  stroke="url(#segmentLip)"
                  strokeWidth={isActive ? 9 : 5}
                  strokeLinecap="round"
                  opacity={isActive ? 0.82 : 0.36}
                  fill="transparent"
                  transform={activeTransform}
                />
              </G>
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  wheelArea: {
    width: DEFAULT_WHEEL_SIZE,
    height: DEFAULT_WHEEL_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  swipeHintLayer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    zIndex: 3,
  },
  swipeHintShadow: {
    position: "absolute",
    width: 82,
    height: 180,
    top: "28%",
  },
  swipeHintShadowLeft: {
    left: -8,
  },
  swipeHintShadowRight: {
    right: -8,
  },
  rotatingWheelLayer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  svgWrapper: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#267FA8",
    shadowOpacity: 0.62,
    shadowRadius: 76,
    shadowOffset: { width: 0, height: 26 },
    elevation: 22,
  },
  segmentLabel: {
    position: "absolute",
    width: 86,
    minHeight: 86,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  centerStatus: {
    position: "absolute",
    width: 150,
    minHeight: 104,
    borderRadius: 36,
    borderWidth: 0,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    zIndex: 5,
  },
  centerActionable: {
    borderWidth: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  centerPassive: {
    borderWidth: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  centerConfirm: {
    borderWidth: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  centerConfirmEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: "#5D7C8C",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  centerConfirmLabel: {
    marginTop: 6,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "900",
    color: "#17384A",
    textAlign: "center",
  },
  centerConfirmSubline: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 15,
    color: "#34A6D8",
    fontWeight: "800",
    textAlign: "center",
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.4,
  },
  statusSubline: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
    color: "#5D7C8C",
    textAlign: "center",
    fontWeight: "600",
  },
  secondaryStatusLine: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 16,
    color: "#2F7DA8",
    fontWeight: "900",
    textAlign: "center",
  },
  centerTapHint: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 14,
    color: "#34A6D8",
    fontWeight: "800",
    textAlign: "center",
  },
  thumbHintRow: {
    marginTop: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbHint: {
    fontSize: 13,
    color: "#5D7C8C",
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#5D7C8C",
    fontWeight: "700",
  },
});