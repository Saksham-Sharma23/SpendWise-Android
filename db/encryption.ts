import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_ALIAS = 'spendwise.db.key';

/**
 * The SQLCipher passphrase.
 *
 * This is generated once per install and stored in `expo-secure-store`, which
 * on Android is backed by the Keystore. It is deliberately NOT a constant in
 * the source: a hardcoded key ships inside the APK, anyone can unzip and read
 * it, and the encryption becomes theatre rather than protection.
 *
 * Consequence worth understanding: the key lives only on this device, so a
 * raw copy of `spendwise.db` pulled off the phone is useless without it. That
 * is the point — but it also means a `.db` backup must either travel with its
 * own passphrase or be exported decrypted. Phase 7 handles that explicitly.
 */
export async function getOrCreateDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_ALIAS);
  if (existing) return existing;

  // 32 random bytes, hex-encoded -> a 64-character passphrase.
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await SecureStore.setItemAsync(KEY_ALIAS, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });

  return key;
}

/**
 * Whether a key already exists. Used by the recovery screen to tell apart
 * "first launch" from "the key is gone but the database is not" — the latter
 * means the encrypted file can no longer be opened and restore is the only
 * way forward.
 */
export async function hasDatabaseKey(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_ALIAS)) !== null;
}
