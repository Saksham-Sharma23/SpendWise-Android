// EXPECT: no-restricted-syntax
export function bad(n: number) {
  return n.toLocaleString('en-IN');
}
