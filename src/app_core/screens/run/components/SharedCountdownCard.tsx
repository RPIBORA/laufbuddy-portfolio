import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type SharedCountdownCardProps = {
  countdownText: string;
};

export default function SharedCountdownCard({
  countdownText,
}: SharedCountdownCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Gemeinsamer Countdown</Text>
      <Text style={styles.countdownText}>{countdownText}</Text>
      <Text style={styles.cardSubText}>
        Hier kommt später der echte gemeinsame Start-Countdown rein.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#18202a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  countdownText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardSubText: {
    color: '#7f8896',
    fontSize: 13,
  },
});