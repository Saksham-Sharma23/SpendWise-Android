/**
 * A binary max-heap: the item `compare` ranks highest comes out first.
 *
 * `compare(a, b)` returns a positive number when `a` should come out before
 * `b`, negative when after, 0 when they rank equally. Array-backed, so push
 * and pop are O(log n) and peek is O(1).
 *
 * Used by debt simplification (features/groups/debts.ts), which repeatedly
 * needs "the person owed the most" and "the person who owes the most". It
 * lives in lib/ because it is a data structure, not a groups concept.
 */
export class MaxHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number): void {
    const items = this.items;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(items[i]!, items[parent]!) <= 0) return;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const items = this.items;
    const n = items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let best = i;
      if (left < n && this.compare(items[left]!, items[best]!) > 0) best = left;
      if (right < n && this.compare(items[right]!, items[best]!) > 0) best = right;
      if (best === i) return;
      [items[i], items[best]] = [items[best]!, items[i]!];
      i = best;
    }
  }
}
