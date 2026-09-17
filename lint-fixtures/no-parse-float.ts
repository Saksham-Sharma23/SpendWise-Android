// EXPECT: no-restricted-syntax
export function bad(v: string) {
  return parseFloat(v);
}
