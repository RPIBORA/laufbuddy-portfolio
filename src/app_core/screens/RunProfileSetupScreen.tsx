// src/app_core/screens/RunProfileSetupScreen.tsx
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type BodyProfileGender,
  parseShoeSizeEuInput,
  useBodyProfile,
} from '../state/useBodyProfile';
import { useShoeStatus } from '../state/useShoeStatus';
import { markRunProfileSetupDone } from '../../services/runProfileSetupStatusService';

type RunProfileSetupMode = 'setup' | 'edit';

type RunProfileSetupScreenProps = {
  onFinish: () => void;
  mode?: RunProfileSetupMode;
};

function formatNumberInput(value: number | null): string {
  if (value === null) {
    return '';
  }

  return String(value).replace('.', ',');
}

function parseOptionalNumber(value: string): number | null {
  const normalizedValue = value.trim().replace(',', '.');

  if (normalizedValue.length === 0) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

function parseOptionalInteger(value: string): number | null {
  const parsedValue = parseOptionalNumber(value);

  if (parsedValue === null) {
    return null;
  }

  return Math.round(parsedValue);
}

function getGenderLabel(gender: BodyProfileGender): string {
  if (gender === 'female') {
    return 'Weiblich';
  }

  if (gender === 'male') {
    return 'Männlich';
  }

  if (gender === 'diverse') {
    return 'Divers';
  }

  return 'Keine Angabe';
}

export default function RunProfileSetupScreen({
  onFinish,
  mode = 'setup',
}: RunProfileSetupScreenProps) {
  const isEditMode = mode === 'edit';
  const currentWeightKg = useBodyProfile((state) => state.currentWeightKg);
  const heightCm = useBodyProfile((state) => state.heightCm);
  const savedGender = useBodyProfile((state) => state.gender);
  const savedShoeSizeEu = useBodyProfile((state) => state.shoeSizeEu);
  const setBodyProfile = useBodyProfile((state) => state.setBodyProfile);

  const [weightInput, setWeightInput] = useState(formatNumberInput(currentWeightKg));
  const [heightInput, setHeightInput] = useState(formatNumberInput(heightCm));
  const [gender, setGender] = useState<BodyProfileGender>(savedGender);
  const [shoeSizeInput, setShoeSizeInput] = useState(formatNumberInput(savedShoeSizeEu));
  const [shoeBrand, setShoeBrand] = useState('');
  const [shoeModel, setShoeModel] = useState('');

  async function finishSetup() {
    if (!isEditMode) {
      await markRunProfileSetupDone();
    }

    onFinish();
  }

  async function handleSave() {
    const parsedWeightKg = parseOptionalNumber(weightInput);
    const parsedHeightCm = parseOptionalInteger(heightInput);
    const trimmedShoeSizeInput = shoeSizeInput.trim();
    const shoeSizeEu =
      trimmedShoeSizeInput.length === 0
        ? null
        : parseShoeSizeEuInput(trimmedShoeSizeInput);
    const trimmedShoeBrand = shoeBrand.trim();
    const trimmedShoeModel = shoeModel.trim();

    setBodyProfile({
      currentWeightKg: parsedWeightKg,
      heightCm: parsedHeightCm,
      gender,
      shoeSizeEu,
    });
    if (trimmedShoeBrand || trimmedShoeModel) {
      useShoeStatus.getState().configureInitialShoe({
        name: `${trimmedShoeBrand} ${trimmedShoeModel}`.trim(),
        brand: trimmedShoeBrand || null,
        model: trimmedShoeModel || null,
        maxKm: 600,
        shoeSizeEu,
      });
    }

    await finishSetup();
  }

  async function handleSkip() {
    await finishSetup();
  }

  const genderOptions: BodyProfileGender[] = ['female', 'male', 'diverse', null];

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>LaufBuddy</Text>
        <Text style={styles.title}>Laufprofil</Text>
        <Text style={styles.text}>
          {isEditMode
            ? 'Passe Gewicht, Größe und Geschlecht an. Die Änderungen werden in deinem Laufprofil gespeichert.'
            : 'Diese Angaben verbessern Auswertungen und spätere Laufdetails. Du kannst alles leer lassen, speichern oder überspringen.'}
        </Text>

        <Text style={styles.sectionTitle}>Läuferangaben</Text>

        <TextInput
          value={shoeSizeInput}
          onChangeText={setShoeSizeInput}
          keyboardType="decimal-pad"
          placeholder="Schuhgröße (EU, optional)"
          placeholderTextColor="#7A8B98"
          style={styles.input}
        />
        <Text style={styles.sectionTitle}>Dein aktueller Laufschuh (optional)</Text>
        <TextInput value={shoeBrand} onChangeText={setShoeBrand} placeholder="Marke" placeholderTextColor="#7A8B98" style={styles.input} />
        <TextInput value={shoeModel} onChangeText={setShoeModel} placeholder="Modell" placeholderTextColor="#7A8B98" style={styles.input} />
        <TextInput
          value={weightInput}
          onChangeText={setWeightInput}
          keyboardType="decimal-pad"
          placeholder="Gewicht in kg"
          placeholderTextColor="#7A8B98"
          style={styles.input}
        />

        <TextInput
          value={heightInput}
          onChangeText={setHeightInput}
          keyboardType="number-pad"
          placeholder="Größe in cm"
          placeholderTextColor="#7A8B98"
          style={styles.input}
        />

        <View style={styles.genderGrid}>
          {genderOptions.map((genderOption) => {
            const isSelected = gender === genderOption;

            return (
              <Pressable
                key={genderOption ?? 'none'}
                onPress={() => setGender(genderOption)}
                style={[
                  styles.genderButton,
                  isSelected ? styles.genderButtonSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.genderButtonText,
                    isSelected ? styles.genderButtonTextSelected : null,
                  ]}
                >
                  {getGenderLabel(genderOption)}
                </Text>
              </Pressable>
            );
          })}
        </View>


        <Pressable onPress={handleSave} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {isEditMode ? 'Änderungen speichern' : 'Speichern'}
          </Text>
        </Pressable>

        <Pressable onPress={handleSkip} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>
            {isEditMode ? 'Abbrechen' : 'Erstmal überspringen'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 54,
    paddingBottom: 40,
    backgroundColor: '#F3FAFD',
  },
  card: {
    borderRadius: 32,
    padding: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.16)',
  },
  eyebrow: {
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
    marginBottom: 4,
  },
  title: {
    color: '#153243',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  text: {
    color: '#4B6170',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#12384D',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 10,
  },
  input: {
    borderRadius: 20,
    backgroundColor: '#EFF6FA',
    color: '#12384D',
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  genderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  genderButton: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#EFF6FA',
  },
  genderButtonSelected: {
    backgroundColor: '#2477A8',
  },
  genderButtonText: {
    color: '#12384D',
    fontSize: 14,
    fontWeight: '900',
  },
  genderButtonTextSelected: {
    color: '#FFFFFF',
  },
  primaryButton: {
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#2477A8',
    marginTop: 8,
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#E7F1F7',
  },
  secondaryButtonText: {
    color: '#12384D',
    fontSize: 16,
    fontWeight: '900',
  },
});
