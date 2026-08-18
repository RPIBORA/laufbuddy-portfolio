import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type ConnectionQualityCardProps = {
  qualityText: string;
  latencyText: string;
};

export default function ConnectionQualityCard({
  qualityText,
  latencyText,
}: ConnectionQualityCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Verbindungsqualität</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Qualität</Text>
        <Text style={styles.value}>{qualityText}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Latenz</Text>
        <Text style={styles.value}>{latencyText}</Text>
      </View>

      <Text style={styles.cardSubText}>
        Hier kommt später die echte WebRTC-Verbindungsqualität rein.
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
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    color: '#b0b7c3',
    fontSize: 15,
  },
  value: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cardSubText: {
    color: '#7f8896',
    fontSize: 13,
    marginTop: 6,
  },
});