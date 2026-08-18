import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type ReadyStatusCardProps = {
  myReady: boolean;
  buddyReady: boolean;
};

export default function ReadyStatusCard({
  myReady,
  buddyReady,
}: ReadyStatusCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Bereitschaft</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Ich</Text>
        <Text style={styles.value}>
          {myReady ? 'bereit' : 'noch nicht bereit'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Buddy</Text>
        <Text style={styles.value}>
          {buddyReady ? 'bereit' : 'noch nicht bereit'}
        </Text>
      </View>
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
});