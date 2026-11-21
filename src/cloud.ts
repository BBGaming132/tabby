import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Circle, Entry, Person, Recurring } from './ledger';

type Row = Record<string, any>;
export type CloudEntry = Entry & { recurrenceKey?: string };

/** Frontend publishable key only. Authorization is enforced by PostgreSQL. */
export class Cloud {
  readonly client: SupabaseClient;
  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: { storageKey: 'tabby-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  private redirect(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }
  private async command(op: string, p: Row): Promise<Row> {
    const { data, error } = await this.client.rpc('tabby_command', { op, p });
    if (error) throw new Error(error.message);
    return data as Row;
  }
  async getSession(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session;
  }
  async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return data;
  }
  async signUp(email: string, password: string, name: string) {
    if (password.length < 10) throw new Error('Choose a password with at least 10 characters.');
    const { data, error } = await this.client.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: this.redirect(), data: { display_name: name.trim() } },
    });
    if (error) throw error;
    return data;
  }
  async resetPassword(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: this.redirect() });
    if (error) throw error;
  }
  async updatePassword(password: string) {
    if (password.length < 10) throw new Error('Choose a password with at least 10 characters.');
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
  }
  async signOut() {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }
  async loadCircles(): Promise<Circle[]> {
    const get = async (table: string) => {
      const rows: Row[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await this.client.from(table).select('*').order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
        if (error) throw new Error(error.message);
        rows.push(...data as Row[]);
        if (data.length < 500) return rows;
      }
    };
    const [circles, members, entries, recurring] = await Promise.all([
      get('tabby_circles'), get('tabby_members'), get('tabby_entries'), get('tabby_recurring'),
    ]);
    return circles.map(c => ({
      id: c.id, ownerId: c.owner_id, name: c.name, emoji: c.emoji,
      members: members.filter(m => m.circle_id === c.id).map(m => ({ id: m.id, name: m.name, color: m.color, userId: m.user_id || undefined } as Person)),
      entries: entries.filter(e => e.circle_id === c.id).map(e => ({
        id: e.id, kind: e.kind, title: e.title, amount: e.amount, payerId: e.payer_id,
        recipientId: e.recipient_id || undefined, shares: e.shares, date: e.date,
        vendor: e.vendor || undefined, category: e.category || undefined, note: e.note || undefined,
        status: e.status, createdBy: e.created_by, confirmedBy: e.confirmed_by || undefined,
        createdAt: e.created_at, recurrenceKey: e.recurrence_key || undefined,
        recurringId: e.recurrence_key?.split(':')[0],
      } as CloudEntry)),
      recurring: recurring.filter(r => r.circle_id === c.id).map(r => ({
        id: r.id, createdBy: r.created_by, title: r.title, amount: r.amount, payerId: r.payer_id, shares: r.shares,
        dayOfMonth: r.day_of_month, nextDate: r.next_date, vendor: r.vendor || undefined,
        category: r.category || undefined, note: r.note || undefined, active: r.active,
      } as Recurring)),
    }));
  }
  async loadAudit(circleId: string) {
    const { data, error } = await this.client.from('tabby_audit').select('*').eq('circle_id', circleId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  }
  async createCircle(name: string, personName: string, emoji = '🏡'): Promise<string> {
    return (await this.command('create_circle', { name, personName, emoji })).id;
  }
  async addPerson(circleId: string, name: string, color?: string): Promise<string> {
    return (await this.command('add_person', { circleId, name, color })).id;
  }
  async createInvite(circleId: string, personId: string): Promise<string> {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    await this.command('create_invite', { circleId, personId, tokenHash: await hashInvite(token) });
    return token;
  }
  async acceptInvite(token: string): Promise<string> {
    return (await this.command('accept_invite', { tokenHash: await hashInvite(token) })).id;
  }
  async addEntry(circleId: string, entry: CloudEntry): Promise<string> {
    return (await this.command('add_entry', { ...entry, circleId,
      recurrenceKey: entry.recurrenceKey || (entry.recurringId ? `${entry.recurringId}:${entry.date}` : undefined),
    })).id;
  }
  async confirmPayment(id: string): Promise<void> { await this.command('confirm_payment', { id }); }
  async voidEntry(id: string, reason?: string): Promise<void> { await this.command('void_entry', { id, reason }); }
  async addRecurring(circleId: string, template: Recurring): Promise<string> {
    return (await this.command('add_recurring', { ...template, circleId })).id;
  }
  async toggleRecurring(id: string, active: boolean): Promise<void> { await this.command('toggle_recurring', { id, active }); }
}

async function hashInvite(token: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('This invitation link is invalid.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
