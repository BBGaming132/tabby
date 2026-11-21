import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { money, parseMoney, splitEqual, isValidDate, validateEntry, balances, pairBalances, forecasts, exportCSV, type Entry, type Person, type Recurring } from '../src/ledger.ts';

const people: Person[] = [{ id: 'b', name: 'Bennett' }, { id: 'j', name: 'Julia' }, { id: 'g', name: 'Gia' }];
const expense = (overrides: Partial<Entry> = {}): Entry => ({
  id: 'e1', kind: 'expense', title: 'Phone bill', amount: 10001, payerId: 'b',
  shares: splitEqual(10001, ['b', 'j']), date: '2026-11-21', status: 'confirmed', ...overrides,
});
const payment = (overrides: Partial<Entry> = {}): Entry => ({
  id: 'p1', kind: 'payment', title: 'Payback', amount: 2000, payerId: 'j', recipientId: 'b',
  shares: [], date: '2026-11-22', status: 'confirmed', ...overrides,
});
const template: Recurring = {
  id: 'r1', title: 'Phone', amount: 10000, payerId: 'b', shares: splitEqual(10000, ['b', 'j']),
  dayOfMonth: 31, nextDate: '2027-01-31', active: true,
};

describe('amount input and exact splitting', () => {
  it('parses cents without decimal multiplication drift', () => {
    assert.equal(parseMoney('0.29'), 29);
    assert.equal(parseMoney('1.01'), 101);
    assert.equal(parseMoney(' 12.3 '), 1230);
    assert.equal(parseMoney('.50'), 50);
    assert.equal(parseMoney('0001.09'), 109);
    assert.equal(parseMoney('0'), 0);
    assert.equal(money(-101), '-$1.01');
    assert.equal(parseMoney('90071992547409.91'), Number.MAX_SAFE_INTEGER);
    assert.equal(money(Number.MAX_SAFE_INTEGER), '$90,071,992,547,409.91');
  });
  it('rejects coercion, exponent, negative, excessive decimals and unsafe amounts', () => {
    for (const bad of ['', ' ', '-1', '1e3', '1.001', '1.', 'NaN', 'Infinity', '$1', '1,000', '1 2', '90071992547410']) {
      assert.throws(() => parseMoney(bad), undefined, bad);
    }
    assert.throws(() => money(1.1));
  });
  it('assigns remainder cents deterministically and preserves the total', () => {
    assert.deepEqual(splitEqual(100, ['b', 'j', 'g']), [{ personId: 'b', amount: 34 }, { personId: 'j', amount: 33 }, { personId: 'g', amount: 33 }]);
    assert.deepEqual(splitEqual(1, ['b', 'j']), [{ personId: 'b', amount: 1 }, { personId: 'j', amount: 0 }]);
    for (let total = 0; total < 1000; total++) assert.equal(splitEqual(total, ['b', 'j', 'g']).reduce((sum, s) => sum + s.amount, 0), total);
    assert.throws(() => splitEqual(1, []));
    assert.throws(() => splitEqual(100, ['b', 'b']));
    assert.throws(() => splitEqual(-1, ['b']));
  });
});

describe('ledger accounting', () => {
  it('credits payer only for other people’s shares', () => {
    assert.deepEqual({ ...balances([expense()], people) }, { b: 5000, j: -5000, g: 0 });
    assert.deepEqual({ ...pairBalances([expense()], 'b') }, { j: 5000 });
    assert.deepEqual({ ...pairBalances([expense()], 'j') }, { b: -5000 });
  });
  it('confirmed partial payments reduce both sides by the same amount', () => {
    assert.deepEqual({ ...balances([expense(), payment()], people) }, { b: 3000, j: -3000, g: 0 });
    assert.equal(pairBalances([expense(), payment()], 'b').j, 3000);
    assert.equal(pairBalances([expense(), payment()], 'j').b, -3000);
    assert.equal(Object.values(balances([expense(), payment()], people)).reduce((a, b) => a + b, 0), 0);
  });
  it('pending and void payments and expenses never affect balances', () => {
    const entries = [expense(), payment({ status: 'pending' }), payment({ status: 'void' }), expense({ status: 'pending' }), expense({ status: 'void' })];
    assert.equal(balances(entries, people).b, 5000);
    assert.equal(pairBalances(entries, 'b').j, 5000);
  });
  it('settles exactly and supports an overpayment becoming a credit', () => {
    assert.equal(pairBalances([expense(), payment({ amount: 5000 })], 'b').j, 0);
    assert.equal(pairBalances([expense(), payment({ amount: 6000 })], 'b').j, -1000);
  });
  it('does not pass debts along a chain of friends', () => {
    const entries = [expense({ amount: 1000, shares: [{ personId: 'j', amount: 1000 }] }), expense({ id: 'e2', amount: 1000, payerId: 'j', shares: [{ personId: 'g', amount: 1000 }] })];
    assert.deepEqual({ ...pairBalances(entries, 'b') }, { j: 1000 });
    assert.deepEqual({ ...pairBalances(entries, 'j') }, { b: -1000, g: 1000 });
    assert.deepEqual({ ...balances(entries, people) }, { b: 1000, j: 0, g: -1000 });
  });
  it('rejects invalid or nonconserving ledger entries', () => {
    assert.throws(() => validateEntry(expense({ amount: 0 })));
    assert.throws(() => validateEntry(expense({ amount: 10000.5 })));
    assert.throws(() => validateEntry(expense({ shares: [{ personId: 'j', amount: 1 }] })));
    assert.throws(() => validateEntry(expense({ shares: [{ personId: 'j', amount: 5000 }, { personId: 'j', amount: 5001 }] })));
    assert.throws(() => validateEntry(expense({ payerId: 'x' }), people));
    assert.throws(() => validateEntry(expense({ shares: [{ personId: 'x', amount: 10001 }] }), people));
    assert.throws(() => validateEntry(payment({ recipientId: 'j' })));
    assert.throws(() => validateEntry(payment({ recipientId: 'x' }), people));
    assert.throws(() => validateEntry(expense({ date: '2026-02-30' })));
  });
  it('uses safe dictionary keys for user supplied IDs', () => {
    const specialPeople = [{ id: '__proto__', name: 'One' }, { id: 'constructor', name: 'Two' }];
    const entry = expense({ payerId: '__proto__', amount: 200, shares: [{ personId: 'constructor', amount: 200 }] });
    assert.equal(balances([entry], specialPeople).__proto__, 200);
    assert.equal(pairBalances([entry], '__proto__').constructor, 200);
  });
});

describe('recurring estimates', () => {
  it('clamps short months without losing the original billing day', () => {
    assert.deepEqual(forecasts([template], '2027-01-01', '2027-04-30').map(f => f.date), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });
  it('handles leap years, date bounds, start dates and disabled templates', () => {
    assert.deepEqual(forecasts([{ ...template, nextDate: '2028-01-31' }], '2028-02-01', '2028-03-30').map(f => f.date), ['2028-02-29']);
    assert.equal(forecasts([template], '2026-01-01', '2026-12-31').length, 0);
    assert.equal(forecasts([{ ...template, active: false }], '2027-01-01', '2027-12-31').length, 0);
    assert.equal(forecasts([template], '2027-01-31', '2027-01-31').length, 1);
    assert.throws(() => forecasts([template], '2027-01-02', '2027-01-01'));
    assert.throws(() => forecasts([{ ...template, dayOfMonth: 32 }], '2027-01-01', '2027-02-01'));
  });
  it('returns independent forecast shares and stable identifiers', () => {
    const rows = forecasts([template], '2027-01-01', '2027-03-31');
    assert.equal(rows[0].id, 'r1:2027-01-31');
    assert.equal(rows[0].recurringId, 'r1');
    rows[0].shares[0].amount = 1;
    assert.equal(template.shares[0].amount, 5000);
    assert.equal(rows[1].shares[0].amount, 5000);
  });
  it('validates real calendar dates including century rules', () => {
    for (const good of ['2028-02-29', '2000-02-29', '2026-12-31', '0001-01-01']) assert.equal(isValidDate(good), true, good);
    for (const bad of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-1-01', '0000-01-01', '2026-01-00', '2026-01-01T00:00:00Z']) assert.equal(isValidDate(bad), false, bad);
  });
});

describe('CSV export', () => {
  it('escapes commas, newlines, quotes and spreadsheet formulas', () => {
    const result = exportCSV([expense({ title: '=HYPERLINK("bad")', vendor: 'A, B', note: 'line one\n"line two"' })], people);
    assert.ok(result.includes('"\'=HYPERLINK(""bad"")"'));
    assert.ok(result.includes('"A, B"'));
    assert.ok(result.includes('"line one\n""line two"""'));
    assert.ok(result.includes('"100.01"'));
    assert.ok(result.endsWith('\r\n'));
  });
  it('neutralizes dangerous person names and whitespace-prefixed formulas', () => {
    const result = exportCSV([expense({ title: '  +SUM(1,2)', note: '\tfoo' })], [{ id: 'b', name: '@name' }]);
    assert.ok(result.includes('"\'@name"'));
    assert.ok(result.includes('"\'  +SUM(1,2)"'));
    assert.ok(result.includes('"\'\tfoo"'));
  });
});
