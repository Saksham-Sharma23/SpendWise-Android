/**
 * A rule a write refused on purpose, with a message written for the user
 * ("Settle Rahul's ₹500 first"). `safeWrite` shows it as-is instead of the
 * generic "Couldn't … Please try again".
 *
 * Its own file, free of React Native imports, so pure write cores
 * (e.g. features/groups/writes.ts) can throw it under Jest.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}
