import { useEffect, useRef } from 'react';
import { InteractionManager, type TextInput } from 'react-native';

/**
 * Focus a field once the screen has finished arriving, not while it arrives.
 *
 * `autoFocus` asks for focus during the first native mount — the same frame
 * the modal's `slide_from_bottom` starts. Android then raises the keyboard
 * and, because the activity is `adjustResize`, resizes the window, all while
 * the slide and the sections' entering animations are still running. Four
 * animations in one ~300 ms budget is what reads as "glitchy": the screen
 * visibly hitches as the keyboard shoves the layout around mid-flight.
 *
 * Waiting hands them out in order instead — the screen settles, then the
 * keyboard rises. It costs nothing: the field is focused before a thumb can
 * reach it.
 *
 * `InteractionManager` rather than a navigation `transitionEnd` event:
 * expo-router's forked native-stack does not reliably emit that event (it
 * appears only in its preview-transition path), so nothing would ever fire.
 * `runAfterInteractions` waits for the running animations and gesture
 * handlers to finish, which is exactly the condition wanted here.
 *
 *   const amountRef = useDeferredFocus<TextInput>(editingId == null);
 *   <TextInput ref={amountRef} … />
 *
 * Pass `false` to leave focus alone — an edit form should not pop a keyboard
 * over data the user came to read.
 */
export function useDeferredFocus<T extends Pick<TextInput, 'focus'>>(enabled: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // Cancelled on unmount: focusing a field on a screen that has already been
    // dismissed would raise the keyboard over whatever replaced it.
    const handle = InteractionManager.runAfterInteractions(() => {
      ref.current?.focus();
    });
    return () => handle.cancel();
  }, [enabled]);

  return ref;
}
