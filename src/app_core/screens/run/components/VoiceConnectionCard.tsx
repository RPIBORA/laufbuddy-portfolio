import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type VoiceConnectionCardProps = {
  audioReady: boolean;
  connectionStatus: string;
};

export default function VoiceConnectionCard({
  audioReady,
  connectionStatus,
}: VoiceConnectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Sprachverbindung</Text>
      <Text style={styles.cardText}>
        {audioReady ? 'Audio bereit' : 'Audio noch nicht bereit'}
      </Text>
      <Text style={styles.cardSubText}>Verbindungsstatus: {connectionStatus}</Text>
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
    marginBottom: 6,
  },
  cardText: {
    color: '#b0b7c3',
    fontSize: 15,
    marginBottom: 4,
  },
  cardSubText: {
    color: '#7f8896',
    fontSize: 13,
  },
});