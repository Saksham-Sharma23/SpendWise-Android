import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { TextInput } from 'react-native';

/**
 * Focus a field once the screen has finished arriving, not while it arrives.
 *
 * `autoFocus` asks for focus during the first native mount — the same frame
 * the modal's entrance animation starts. Android then raises the keyboard
 * and, because the activity is `adjustResize`, resizes the window, all while
 * the screen is still moving. That collision is what reads as "glitchy".
 *
 * The signal is the stack's own `transitionEnd`: react-native-screens calls
 * `onAppear` when the entrance animation has finished, and the native stack
 * view turns that into `transitionEnd` with `closing: false`, targeted at this
 * screen's route (react-navigation/native-stack/views/NativeStackView.native.js).
 *
 * NOT `InteractionManager.runAfterInteractions`. In RN 0.86 it is a deprecated
 * stub that only calls `setImmediate` — it waits one tick, not for anything —
 * and native stack animations never registered with it in the first place.
 * An earlier version of this hook used it and raised the keyboard mid-slide.
 *
 *   const amountRef = useDeferredFocus<TextInput>(editingId == null);
 *   <TextInput ref={amountRef} … />
 *
 * Rules, each one a bug it prevents:
 *   - `enabled: false` leaves focus alone — an edit form should not pop a
 *     keyboard over data the user came to read.
 *   - `enabled` turning true AFTER arrival (the expense form, once its "with
 *     whom?" sheet closes) focuses on the next frame; the event already fired.
 *   - At most ONCE per screen. Otherwise every later sheet closing (Paid by,
 *     Split) would throw the keyboard back up over the description.
 *   - Never steals focus from a field the user has already tapped.
 *   - A safety fallback, so a missed event cannot leave the field unfocused.
 */

/** The one navigation event this hook listens for. */
interface TransitionEvents {
  addListener(type: 'transitionEnd', listener: (e: { data: { closing: boolean } }) => void): () => void;
}

/**
 * Longest the entrance can plausibly take. `fade_from_bottom` settles in
 * 350 ms and `ios_from_right` in ~200; past this the event is not coming.
 */
const SAFETY_MS = 600;

export function useDeferredFocus<T extends Pick<TextInput, 'focus'>>(enabled: boolean) {
  const ref = useRef<T | null>(null);
  const navigation = useNavigation<TransitionEvents>();

  const arrived = useRef(false);
  const done = useRef(false);
  // Read by the arrival callback, which is created once.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const focusOnce = useRef(() => {
    if (done.current) return;
    done.current = true;
    // Someone already chose a field: leave them in it.
    if (TextInput.State.currentlyFocusedInput() != null) return;
    ref.current?.focus();
  }).current;

  // Arrival, once — from the stack's own signal, or the fallback.
  useEffect(() => {
    const arrive = () => {
      if (arrived.current) return;
      arrived.current = true;
      if (enabledRef.current) focusOnce();
    };
    const unsubscribe = navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) arrive();
    });
    const timer = setTimeout(arrive, SAFETY_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [navigation, focusOnce]);

  // Enabled after the screen had already arrived.
  useEffect(() => {
    if (!enabled || !arrived.current || done.current) return;
    const frame = requestAnimationFrame(focusOnce);
    return () => cancelAnimationFrame(frame);
  }, [enabled, focusOnce]);

  return ref;
}
