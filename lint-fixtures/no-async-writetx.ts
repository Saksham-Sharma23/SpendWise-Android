// EXPECT: no-restricted-syntax
declare function writeTx<T>(fn: () => T): T;
export function bad() {
  return writeTx(async () => {
    await Promise.resolve();
    return 1;
  });
}
