import type { ReactNode } from 'react';
import { View } from 'react-native';

import { FieldLabel } from './Section';
import { Text } from './Text';

export { FieldLabel } from './Section';

/**
 * A form field: label, the input, and its error (R4-2).
 *
 *   <Controller control={control} name="note" render={({ field, fieldState }) => (
 *     <Field label="Details" error={fieldState.error?.message}>
 *       <TextInput value={field.value} onChangeText={field.onChange} … />
 *     </Field>
 *   )} />
 *
 * `error` takes react-hook-form's `fieldState.error?.message` (or
 * `errors.x?.message`); nothing renders below the input when it is empty.
 */
export function Field({ label, error, children }: { label?: string; error?: string; children: ReactNode }) {
  return (
    <View>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {children}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

/** A validation message under a field, in the expense colour. */
export function ErrorText({ children }: { children: string }) {
  return (
    <Text weight="medium" size={12} tone="expense" style={{ marginTop: 6 }}>
      {children}
    </Text>
  );
}
