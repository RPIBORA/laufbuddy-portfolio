import React from 'react';
import VoiceConnectionCard from './components/VoiceConnectionCard';
import ReadyStatusCard from './components/ReadyStatusCard';
import BuddyActionsCard from './components/BuddyActionsCard';
import SharedCountdownCard from './components/SharedCountdownCard';

type RunScreenContentProps = {
  audioReady: boolean;
  connectionStatus: string;
  myReady: boolean;
  buddyReady: boolean;
  buddyName: string;
  countdownText: string;
  qualityText: string;
  latencyText: string;
};

export default function RunScreenContent({
  audioReady,
  connectionStatus,
  myReady,
  buddyReady,
  buddyName,
  countdownText,
}: RunScreenContentProps) {
  return (
    <>
      <VoiceConnectionCard
        audioReady={audioReady}
        connectionStatus={connectionStatus}
      />

      <ReadyStatusCard
        myReady={myReady}
        buddyReady={buddyReady}
      />

      <BuddyActionsCard buddyName={buddyName} />

      <SharedCountdownCard countdownText={countdownText} />
    </>
  );
}