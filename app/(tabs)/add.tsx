/**
 * Placeholder for the centre tab slot.
 *
 * expo-router requires a route file for every Tabs.Screen, but this one is
 * never rendered: the tab bar replaces its button with the FAB and its
 * tabPress listener calls preventDefault. Deleting this file breaks the
 * navigator; navigating here is impossible by design.
 */
export default function AddPlaceholder() {
  return null;
}
