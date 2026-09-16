import { MaxHeap } from '../heap';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('MaxHeap', () => {
  it('pops in descending order, matching a sort, over random inputs', () => {
    const rand = lcg(42);
    for (let round = 0; round < 200; round++) {
      const n = Math.floor(rand() * 60);
      const values = Array.from({ length: n }, () => Math.floor(rand() * 1000) - 500);
      const heap = new MaxHeap<number>((a, b) => a - b);
      values.forEach((v) => heap.push(v));
      expect(heap.size).toBe(n);
      const out: number[] = [];
      while (heap.size > 0) out.push(heap.pop()!);
      expect(out).toEqual([...values].sort((a, b) => b - a));
    }
  });

  it('interleaves pushes and pops correctly', () => {
    const heap = new MaxHeap<number>((a, b) => a - b);
    heap.push(3);
    heap.push(9);
    expect(heap.pop()).toBe(9);
    heap.push(1);
    heap.push(7);
    expect(heap.peek()).toBe(7);
    expect(heap.pop()).toBe(7);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBeUndefined();
    expect(heap.peek()).toBeUndefined();
  });

  it('honours a custom comparator, including ties', () => {
    type P = { id: number; paise: number };
    const heap = new MaxHeap<P>((a, b) => a.paise - b.paise || b.id - a.id);
    [
      { id: 3, paise: 500 },
      { id: 1, paise: 500 },
      { id: 2, paise: 900 },
    ].forEach((p) => heap.push(p));
    expect([heap.pop()!.id, heap.pop()!.id, heap.pop()!.id]).toEqual([2, 1, 3]);
  });
});
