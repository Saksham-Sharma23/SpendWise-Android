import { createChangeHub } from '../db/changeHub';

describe('createChangeHub', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('coalesces a burst of row events into one notification', () => {
    const hub = createChangeHub();
    const listener = jest.fn();
    hub.subscribe(['transactions'], listener);

    // A bulk soft-delete of 500 rows fires the update hook 500 times.
    for (let i = 0; i < 500; i++) hub.emit('transactions');
    expect(listener).not.toHaveBeenCalled();

    jest.advanceTimersByTime(32);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies again for a later burst', () => {
    const hub = createChangeHub();
    const listener = jest.fn();
    hub.subscribe(['transactions'], listener);

    hub.emit('transactions');
    jest.advanceTimersByTime(32);
    hub.emit('transactions');
    jest.advanceTimersByTime(32);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('only notifies subscribers of the changed table — including joined tables', () => {
    const hub = createChangeHub();
    const ledger = jest.fn();
    const budgets = jest.fn();
    hub.subscribe(['transactions', 'categories'], ledger);
    hub.subscribe(['budgets'], budgets);

    // Renaming a category must refresh a ledger query that joins categories.
    hub.emit('categories');
    jest.advanceTimersByTime(32);
    expect(ledger).toHaveBeenCalledTimes(1);
    expect(budgets).not.toHaveBeenCalled();
  });

  it('does not call a listener that unsubscribed inside the window', () => {
    const hub = createChangeHub();
    const listener = jest.fn();
    const off = hub.subscribe(['transactions'], listener);
    hub.emit('transactions');
    off();
    jest.advanceTimersByTime(100);
    expect(listener).not.toHaveBeenCalled();
  });

  it('treats a burst across two watched tables as one change', () => {
    const hub = createChangeHub();
    const listener = jest.fn();
    hub.subscribe(['transactions', 'sheet_rows'], listener);
    hub.emit('transactions');
    hub.emit('sheet_rows');
    jest.advanceTimersByTime(32);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
