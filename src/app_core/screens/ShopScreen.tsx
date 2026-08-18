// src/app_core/screens/ShopScreen.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type ShopScreenProps = {
  onBack: () => void;
};

export default function ShopScreen({ onBack }: ShopScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.badge}>SHOP SCREEN</Text>
      <Text style={styles.title}>Partnershop</Text>
      <Text style={styles.subtitle}>
        Hier wird später der In-App-Browser (WebView) eingebunden, 
        damit User direkt in der App einkaufen können, ohne weitergeleitet zu werden.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101418',
    paddingHorizontal: 20,
    paddingTop: 80,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ff8c2a',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#b0b7c3',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#1c2530',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 'auto',
    marginBottom: 40,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});