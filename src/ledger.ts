/** Money is stored exclusively as integer USD cents. No floating point balances. */
export interface Person { id: string; name: string; color?: string; userId?: string }
export interface Share { personId: string; amount: number }
export interface Entry {
  id: string;
  kind: 'expense' | 'payment';
  title: string;
  amount: number;
  payerId: string;
  shares: Share[];
  date: string;
  vendor?: string;
  category?: string;
  note?: string;
  createdBy?: string;
  status: 'confirmed' | 'pending' | 'void';
  recipientId?: string;
  confirmedBy?: string;
  createdAt?: string;
  recurringId?: string;
  recurrenceKey?: string;
}
export interface Recurring {
  id: string;
  createdBy?: string;
  title: string;
  amount: number;
  payerId: string;
  shares: Share[];
  dayOfMonth: number;
  nextDate: string;
  vendor?: string;
  category?: string;
  note?: string;
  active: boolean;
}
export interface Circle {
  id: string;
  ownerId?: string;
  name: string;
  emoji?: string;
  members: Person[];
  entries: Entry[];
  recurring: Recurring[];
}
export interface Forecast {
  id: string;
  recurringId: string;
  title: string;
  date: string;
  amount: number;
  payerId: string;
  shares: Share[];
  vendor?: string;
  category?: string;
  note?: string;
}

function cents(value: number, allowNegative = false): void {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new Error('Use a valid amount in whole cents.');
  }
}
function add(a: number, b: number): number {
  const value = a + b;
  cents(value, true);
  return value;
}

function decimalCents(amount: number): string {
  cents(amount, true);
  const absolute = Math.abs(amount);
  return `${amount < 0 ? '-' : ''}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function money(amount: number): string {
  cents(amount, true);
  const absolute = Math.abs(amount);
  const dollars = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.floor(absolute / 100));
  return `${amount < 0 ? '-' : ''}$${dollars}.${String(absolute % 100).padStart(2, '0')}`;
}

/** Accepts plain, nonnegative decimal input with no more than two decimal places. */
export function parseMoney(input: string): number {
  const value = input.trim();
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(value)) {
    throw new Error('Enter an amount with up to two decimal places.');
  }
  const [whole, decimal = ''] = value.split('.');
  const result = Number(whole || '0') * 100 + Number(decimal.padEnd(2, '0'));
  cents(result);
  return result;
}

/** Any spare cents go to the first people selected, deterministically. */
export function splitEqual(amount: number, personIds: string[]): Share[] {
  cents(amount);
  if (!personIds.length || personIds.some(id => !id) || new Set(personIds).size !== personIds.length) {
    throw new Error('Choose at least one person, without duplicates.');
  }
  const base = Math.floor(amount / personIds.length);
  const remainder = amount % personIds.length;
  return personIds.map((personId, i) => ({ personId, amount: base + (i < remainder ? 1 : 0) }));
}

/** Uses calendar dates rather than local-time parsing, including leap-year validation. */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function validateEntry(entry: Entry, people?: Person[]): void {
  if (!entry.id || !entry.title.trim()) throw new Error('Give this entry a description.');
  if (!['expense', 'payment'].includes(entry.kind)) throw new Error('Choose an expense or a payment.');
  if (!['confirmed', 'pending', 'void'].includes(entry.status)) throw new Error('Invalid entry status.');
  cents(entry.amount);
  if (entry.amount <= 0) throw new Error('The amount must be greater than zero.');
  if (!isValidDate(entry.date)) throw new Error('Choose a valid date.');
  if (!entry.payerId) throw new Error('Choose who paid.');
  const known = people ? new Set(people.map(person => person.id)) : null;
  if (known && !known.has(entry.payerId)) throw new Error('The payer is not in this circle.');
  if (entry.kind === 'payment') {
    if (!entry.recipientId || entry.recipientId === entry.payerId) {
      throw new Error('A payment must be between two different people.');
    }
    if (known && !known.has(entry.recipientId)) throw new Error('The recipient is not in this circle.');
    return;
  }
  if (!entry.shares.length) throw new Error('Choose who this expense is for.');
  const seen = new Set<string>();
  let sum = 0;
  for (const share of entry.shares) {
    cents(share.amount);
    if (!share.personId || seen.has(share.personId)) throw new Error('Each person can have only one share.');
    if (known && !known.has(share.personId)) throw new Error('A person in this split is not in this circle.');
    seen.add(share.personId);
    sum = add(sum, share.amount);
  }
  if (sum !== entry.amount) throw new Error('The shares must add up to the full expense.');
}

/** Positive means this person is owed money. Pending payments never change balances. */
export function balances(entries: Entry[], people: Person[]): Record<string, number> {
  const result: Record<string, number> = Object.create(null);
  for (const person of people) result[person.id] = 0;
  for (const entry of entries) {
    if (entry.status !== 'confirmed') continue;
    validateEntry(entry, people);
    if (entry.kind === 'expense') {
      result[entry.payerId] = add(result[entry.payerId], entry.amount);
      for (const share of entry.shares) result[share.personId] = add(result[share.personId], -share.amount);
    } else {
      result[entry.payerId] = add(result[entry.payerId], entry.amount);
      result[entry.recipientId!] = add(result[entry.recipientId!], -entry.amount);
    }
  }
  return result;
}

/** Direct obligations only: does not move a debt between unrelated relationships. */
export function pairBalances(entries: Entry[], viewerId: string): Record<string, number> {
  const result: Record<string, number> = Object.create(null);
  const bump = (id: string, amount: number) => {
    if (id !== viewerId) result[id] = add(result[id] || 0, amount);
  };
  for (const entry of entries) {
    if (entry.status !== 'confirmed') continue;
    validateEntry(entry);
    if (entry.kind === 'expense') {
      for (const share of entry.shares) {
        if (entry.payerId === viewerId) bump(share.personId, share.amount);
        else if (share.personId === viewerId) bump(entry.payerId, -share.amount);
      }
    } else if (entry.payerId === viewerId) bump(entry.recipientId!, entry.amount);
    else if (entry.recipientId === viewerId) bump(entry.payerId, -entry.amount);
  }
  return result;
}

function monthDate(year: number, month: number, day: number): string {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Inclusive range. Estimates remain separate until explicitly posted as expenses. */
export function forecasts(templates: Recurring[], start: string, end: string): Forecast[] {
  if (!isValidDate(start) || !isValidDate(end) || start > end) throw new Error('Choose a valid forecast date range.');
  const result: Forecast[] = [];
  const [firstYear, firstMonth] = start.split('-').map(Number);
  const [lastYear, lastMonth] = end.split('-').map(Number);
  for (const template of templates) {
    if (!template.active) continue;
    if (!isValidDate(template.nextDate) || !Number.isInteger(template.dayOfMonth) || template.dayOfMonth < 1 || template.dayOfMonth > 31) {
      throw new Error('Choose a valid recurring bill date and monthly day.');
    }
    validateEntry({ ...template, kind: 'expense', status: 'confirmed', date: template.nextDate });
    for (let monthIndex = firstYear * 12 + firstMonth - 1; monthIndex <= lastYear * 12 + lastMonth - 1; monthIndex++) {
      const year = Math.floor(monthIndex / 12);
      const month = monthIndex % 12 + 1;
      const date = monthDate(year, month, template.dayOfMonth);
      if (date < start || date > end || date < template.nextDate) continue;
      result.push({
        id: `${template.id}:${date}`, recurringId: template.id, title: template.title,
        date, amount: template.amount, payerId: template.payerId,
        shares: template.shares.map(share => ({ ...share })),
        vendor: template.vendor, category: template.category, note: template.note,
      });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.recurringId.localeCompare(b.recurringId));
}

function csvCell(value: string): string {
  // Spreadsheet formulas can start after whitespace or a control character.
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportCSV(entries: Entry[], people: Person[]): string {
  const names = new Map(people.map(person => [person.id, person.name]));
  const name = (id?: string) => id ? names.get(id) || id : '';
  const rows: string[][] = [['Date', 'Type', 'Description', 'Amount (USD)', 'Paid by', 'Paid to', 'Split', 'Status', 'Vendor', 'Category', 'Notes']];
  for (const entry of entries) {
    rows.push([
      entry.date, entry.kind, entry.title, decimalCents(entry.amount), name(entry.payerId), name(entry.recipientId),
      entry.shares.map(share => `${name(share.personId)}: ${decimalCents(share.amount)}`).join('; '),
      entry.status, entry.vendor || '', entry.category || '', entry.note || '',
    ]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
