// EXPECT: no-restricted-globals
export async function bad() {
  return fetch('https://example.com');
}
