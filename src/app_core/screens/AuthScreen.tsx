// src/app_core/screens/AuthScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  loginWithEmail,
  loginWithGoogle,
  requestPasswordReset,
  registerWithEmail,
} from '../../services/firebaseAuthService';

type AuthMode = 'login' | 'register';

function getButtonLabel(mode: AuthMode, busy: boolean): string {
  if (busy) {
    return mode === 'login' ? 'Login läuft...' : 'Registrierung läuft...';
  }

  return mode === 'login' ? 'Einloggen' : 'Registrieren';
}

function getAuthErrorMessage(error: unknown, mode: AuthMode): string {
  const fallbackMessage =
    mode === 'login'
      ? 'Die Anmeldung konnte nicht abgeschlossen werden.'
      : 'Die Registrierung konnte nicht abgeschlossen werden.';

  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const normalizedMessage = error.message.toLowerCase();

  if (
    normalizedMessage.includes('auth/email-already-in-use') ||
    normalizedMessage.includes('email-already-in-use')
  ) {
    return 'Diese E-Mail-Adresse ist bereits registriert.';
  }

  if (
    normalizedMessage.includes('auth/invalid-email') ||
    normalizedMessage.includes('invalid-email')
  ) {
    return 'Die E-Mail-Adresse ist ungültig.';
  }

  if (
    normalizedMessage.includes('auth/user-not-found') ||
    normalizedMessage.includes('user-not-found')
  ) {
    return 'Zu dieser E-Mail-Adresse wurde kein Konto gefunden.';
  }

  if (
    normalizedMessage.includes('auth/wrong-password') ||
    normalizedMessage.includes('wrong-password') ||
    normalizedMessage.includes('auth/invalid-credential') ||
    normalizedMessage.includes('invalid-credential')
  ) {
    return 'E-Mail-Adresse oder Passwort sind nicht korrekt.';
  }

  if (
    normalizedMessage.includes('auth/weak-password') ||
    normalizedMessage.includes('weak-password')
  ) {
    return 'Das Passwort ist zu schwach.';
  }

  if (
    normalizedMessage.includes('auth/too-many-requests') ||
    normalizedMessage.includes('too-many-requests')
  ) {
    return 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.';
  }

  if (
    normalizedMessage.includes('auth/network-request-failed') ||
    normalizedMessage.includes('network-request-failed')
  ) {
    return 'Netzwerkfehler. Bitte prüfe deine Verbindung.';
  }

  return fallbackMessage;
}

function getGoogleAuthErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Die Google-Anmeldung konnte nicht abgeschlossen werden.";
  }

  const normalizedMessage = error.message.toLowerCase();

  if (
    normalizedMessage.includes("abgebrochen") ||
    normalizedMessage.includes("cancel")
  ) {
    return "Die Google-Anmeldung wurde abgebrochen.";
  }

  if (normalizedMessage.includes("network")) {
    return "Netzwerkfehler. Bitte prüfe deine Verbindung.";
  }

  if (normalizedMessage.includes("developer_error")) {
    return "Google-Anmeldung ist noch nicht korrekt für diese Android-App eingerichtet.";
  }

  return "Die Google-Anmeldung konnte nicht abgeschlossen werden.";
}

function getPasswordResetErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid-email')) return 'Die E-Mail-Adresse ist ungültig.';
  if (message.includes('too-many-requests')) return 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.';
  if (message.includes('network-request-failed') || message.includes('network')) return 'Netzwerkfehler. Bitte prüfe deine Verbindung.';
  return 'Das Zurücksetzen des Passworts konnte nicht vorbereitet werden. Bitte versuche es später erneut.';
}

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const isBusy = busy || googleBusy;

  const title = useMemo(() => {
    return mode === 'login' ? 'Einloggen' : 'Registrieren';
  }, [mode]);

  const subtitle = useMemo(() => {
    return mode === 'login'
      ? 'Melde dich mit deiner E-Mail-Adresse an.'
      : 'Lege deinen LaufBuddy-Account an.';
  }, [mode]);

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail) {
      Alert.alert('Fehlende E-Mail', 'Bitte gib eine E-Mail-Adresse ein.');
      return;
    }

    if (!normalizedPassword) {
      Alert.alert('Fehlendes Passwort', 'Bitte gib ein Passwort ein.');
      return;
    }

    if (normalizedPassword.length < 6) {
      Alert.alert(
        'Passwort zu kurz',
        'Das Passwort muss mindestens 6 Zeichen haben.',
      );
      return;
    }

    setBusy(true);

    try {
      if (mode === 'login') {
        await loginWithEmail({
          email: normalizedEmail,
          password: normalizedPassword,
        });
      } else {
        await registerWithEmail({
          email: normalizedEmail,
          password: normalizedPassword,
        });
      }
    } catch (error) {
      Alert.alert('Auth-Fehler', getAuthErrorMessage(error, mode));
    } finally {
      setBusy(false);
    }
  };

  const submitWithGoogle = async () => {
    setGoogleBusy(true);

    try {
      await loginWithGoogle();
    } catch (error) {
      Alert.alert("Google-Anmeldung", getGoogleAuthErrorMessage(error));
    } finally {
      setGoogleBusy(false);
    }
  };

  const requestReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('E-Mail erforderlich', 'Bitte gib zuerst deine E-Mail-Adresse ein.');
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(normalizedEmail);
      Alert.alert('Passwort zurücksetzen', 'Wenn für diese E-Mail-Adresse ein Konto besteht, wurde ein Link zum Zurücksetzen des Passworts versendet.');
    } catch (error) {
      Alert.alert('Passwort zurücksetzen', getPasswordResetErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>LaufBuddy</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="E-Mail"
          placeholderTextColor="#7A7A7A"
          style={styles.input}
          value={email}
        />

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
          onChangeText={setPassword}
          placeholder="Passwort"
          placeholderTextColor="#7A7A7A"
          secureTextEntry
          style={styles.input}
          value={password}
        />

        <Pressable
          disabled={isBusy}
          onPress={submit}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.primaryButtonPressed : null,
            isBusy ? styles.buttonDisabled : null,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {getButtonLabel(mode, busy)}
            </Text>
          )}
        </Pressable>

        {mode === 'login' ? (
          <Pressable disabled={isBusy} onPress={requestReset} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Passwort vergessen?</Text>
          </Pressable>
        ) : null}

        <Pressable
          disabled={isBusy}
          onPress={submitWithGoogle}
          style={({ pressed }) => [
            styles.googleButton,
            pressed ? styles.googleButtonPressed : null,
            isBusy ? styles.buttonDisabled : null,
          ]}
        >
          {googleBusy ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <Text style={styles.googleButtonText}>Mit Google anmelden</Text>
          )}
        </Pressable>

        <Pressable
          disabled={isBusy}
          onPress={() => {
            setMode((currentMode) =>
              currentMode === 'login' ? 'register' : 'login',
            );
          }}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.secondaryButtonPressed : null,
            isBusy ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.secondaryButtonText}>
            {mode === 'login'
              ? 'Noch kein Konto? Registrieren'
              : 'Schon ein Konto? Einloggen'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3FAFD',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.16)',
    padding: 20,
    gap: 14,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#153243',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#5B6B7A',
    textAlign: 'center',
  },
  resetButton: { alignItems: 'center', paddingVertical: 6 },
  resetButtonText: { color: '#2477A8', fontSize: 15, fontWeight: '800' },
  input: {
    width: '100%',
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonPressed: {
    opacity: 0.9,
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleButton: {
    width: "100%",
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  googleButtonPressed: {
    opacity: 0.8,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  eyebrow: {
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
});
