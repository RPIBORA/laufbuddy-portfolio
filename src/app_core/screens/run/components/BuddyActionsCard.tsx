import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type BuddyActionsCardProps = {
  buddyName: string;
};

export default function BuddyActionsCard({
  buddyName,
}: BuddyActionsCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Buddy-Aktionen</Text>
      <Text style={styles.cardText}>Verbunden mit: {buddyName}</Text>

      <Pressable style={styles.actionButton}>
        <Text style={styles.actionButtonText}>Buddy anpingen</Text>
      </Pressable>

      <Pressable style={styles.actionButton}>
        <Text style={styles.actionButtonText}>Kurz warten senden</Text>
      </Pressable>

      <Pressable style={styles.actionButton}>
        <Text style={styles.actionButtonText}>Los geht’s senden</Text>
      </Pressable>
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
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#4f6b8a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});