import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import type { WhatsAppInboundMessage, WhatsAppTextMessage } from '@/lib/whatsapp/types';
import type { WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';

const SESSION_MINUTES = 15;

export type FinancialMenuItem = 'balance' | 'last_payment' | 'next_due' | 'wallet';

export interface FinancialHouse {
  id: string;
  label: string;
}

export interface WhatsAppFinancialSession {
  phoneNumber: string;
  residentId: string;
  currentNode: string;
  selectedHouseId: string | null;
  pinAuthenticated: boolean;
  expiresAt: string;
}

export interface FinancialAnswer {
  body: string;
  metadata?: Record<string, unknown>;
}

export interface WhatsAppFinancialRepository {
  getSession(phoneNumber: string): Promise<WhatsAppFinancialSession | null>;
  saveSession(session: WhatsAppFinancialSession): Promise<void>;
  getForcePin(): Promise<boolean>;
  getPinHash(residentId: string): Promise<string | null>;
  setPinHash(residentId: string, hash: string): Promise<void>;
  getBillableHouses(residentId: string): Promise<FinancialHouse[]>;
  getBalance(residentId: string, houseId: string): Promise<FinancialAnswer>;
  getLastPayment(residentId: string, houseId: string): Promise<FinancialAnswer>;
  getNextDue(residentId: string, houseId: string): Promise<FinancialAnswer>;
  getWallet(residentId: string): Promise<FinancialAnswer>;
  logDisclosure(input: {
    residentId: string;
    phoneNumber: string;
    houseId: string | null;
    menuItem: FinancialMenuItem;
    pinAuthenticated: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex');
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function expiry(): string {
  return new Date(Date.now() + SESSION_MINUTES * 60 * 1000).toISOString();
}

function menuText(): string {
  return [
    'Financial standing',
    'Reply with a number:',
    '1. Balance',
    '2. Last payment',
    '3. Next due',
    '4. Wallet',
    'Reply PIN 1234 to add an optional security PIN.',
  ].join('\n');
}

function parseMenuItem(text: string): FinancialMenuItem | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === '1' || normalized === 'balance') return 'balance';
  if (normalized === '2' || normalized === 'last' || normalized === 'last payment') return 'last_payment';
  if (normalized === '3' || normalized === 'due' || normalized === 'next due') return 'next_due';
  if (normalized === '4' || normalized === 'wallet') return 'wallet';
  return null;
}

function itemLabel(item: FinancialMenuItem): string {
  return item === 'last_payment'
    ? 'last payment'
    : item === 'next_due'
      ? 'next due'
      : item;
}

function propertyText(houses: FinancialHouse[], item: FinancialMenuItem): string {
  return [
    `Which property should I use for your ${itemLabel(item)}?`,
    ...houses.map((house, index) => `${index + 1}. ${house.label}`),
    'Reply with the property number.',
  ].join('\n');
}

function createSupabaseRepository(): WhatsAppFinancialRepository {
  return {
    async getSession(phoneNumber) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('phone_number, resident_id, current_node, selected_house_id, pin_authenticated, expires_at')
        .eq('phone_number', phoneNumber)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (error) throw error;
      return data as WhatsAppFinancialSession | null;
    },

    async saveSession(session) {
      const supabase = createAdminClient();
      const { error } = await supabase.from('whatsapp_sessions').upsert(
        { ...session, updated_at: new Date().toISOString() },
        { onConflict: 'phone_number' }
      );
      if (error) throw error;
    },

    async getForcePin() {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'whatsapp_force_pin')
        .maybeSingle();
      if (error) throw error;
      return data?.value === true || data?.value === 'true';
    },

    async getPinHash(residentId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('residents')
        .select('whatsapp_pin_hash')
        .eq('id', residentId)
        .single();
      if (error) throw error;
      return data?.whatsapp_pin_hash || null;
    },

    async setPinHash(residentId, pinHash) {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('residents')
        .update({ whatsapp_pin_hash: pinHash, whatsapp_pin_set_at: new Date().toISOString() })
        .eq('id', residentId);
      if (error) throw error;
    },

    async getBillableHouses(residentId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('resident_houses')
        .select('house_id, resident_role, house:houses(house_number, short_name, street:streets(name))')
        .eq('resident_id', residentId)
        .eq('is_active', true)
        .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer']);
      if (error) throw error;
      return (data || []).map((row) => {
        const houseData = row.house as unknown as { house_number: string; short_name: string | null; street: { name: string } | { name: string }[] | null } | { house_number: string; short_name: string | null; street: { name: string } | { name: string }[] | null }[];
        const house = Array.isArray(houseData) ? houseData[0] : houseData;
        const street = Array.isArray(house.street) ? house.street[0]?.name : house.street?.name;
        return { id: row.house_id, label: house.short_name || `${house.house_number}, ${street || 'Estate'}` };
      });
    },

    async getBalance(residentId, houseId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('amount_due, amount_paid')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .neq('status', 'void');
      if (error) throw error;
      const outstanding = (data || []).reduce((sum, invoice) => sum + Number(invoice.amount_due || 0) - Number(invoice.amount_paid || 0), 0);
      return { body: `Outstanding balance: ${formatNaira(Math.max(0, outstanding))}.` };
    },

    async getLastPayment(residentId, houseId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('payment_records')
        .select('amount, payment_date, reference_number, method')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .eq('status', 'paid')
        .order('payment_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { body: 'No paid payment record was found for this property.' };
      return {
        body: `Last payment: ${formatNaira(Number(data.amount))} on ${new Date(data.payment_date).toLocaleDateString('en-NG')}${data.reference_number ? ` (ref ${data.reference_number})` : ''}.`,
        metadata: { reference_number: data.reference_number, method: data.method },
      };
    },

    async getNextDue(residentId, houseId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number, amount_due, amount_paid, due_date')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .neq('status', 'void')
        .order('due_date', { ascending: true })
        .limit(20);
      if (error) throw error;
      const next = (data || []).find((invoice) => Number(invoice.amount_paid) < Number(invoice.amount_due));
      if (!next) return { body: 'There is no outstanding due invoice for this property.' };
      const remaining = Number(next.amount_due) - Number(next.amount_paid);
      return { body: `Next due: ${formatNaira(remaining)} on ${new Date(next.due_date).toLocaleDateString('en-NG')} (invoice ${next.invoice_number}).` };
    },

    async getWallet(residentId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('resident_wallets')
        .select('balance')
        .eq('resident_id', residentId)
        .maybeSingle();
      if (error) throw error;
      return { body: `Wallet balance: ${formatNaira(Number(data?.balance || 0))}.` };
    },

    async logDisclosure(input) {
      const supabase = createAdminClient();
      const { error } = await supabase.from('whatsapp_disclosure_logs').insert(input);
      if (error) throw error;
    },
  };
}

export interface WhatsAppFinancialHandlerOptions {
  repository: WhatsAppFinancialRepository;
  optedIn: boolean;
  send?: (message: WhatsAppTextMessage) => Promise<{ success: boolean; error?: string }>;
}

async function sendFinancialReply(
  message: WhatsAppInboundMessage,
  body: string,
  send: WhatsAppFinancialHandlerOptions['send']
): Promise<void> {
  const result = await (send || ((outbound) => sendWhatsAppMessage(outbound)))({ to: message.from, body });
  if (!result.success) throw new Error(result.error || 'WhatsApp financial reply failed');
}

export async function handleFinancialMessage(
  message: WhatsAppInboundMessage,
  identity: WhatsAppResidentIdentity,
  options: WhatsAppFinancialHandlerOptions
): Promise<void> {
  if (!options.optedIn) {
    await sendFinancialReply(message, 'Please reply YES first to enable WhatsApp access to financial standing.', options.send);
    return;
  }

  const phoneNumber = normalizePhoneNumber(message.from);
  const text = message.text?.trim() || '';
  let session = await options.repository.getSession(phoneNumber);
  if (session && Date.parse(session.expiresAt) <= Date.now()) {
    session = null;
  }
  if (!session || session.residentId !== identity.id) {
    session = {
      phoneNumber,
      residentId: identity.id,
      currentNode: 'menu',
      selectedHouseId: null,
      pinAuthenticated: false,
      expiresAt: expiry(),
    };
  }

  const pinCommand = text.match(/^PIN\s+([0-9]{4,6})$/i);
  if (pinCommand) {
    const pinHash = hashPin(pinCommand[1]);
    const existingHash = await options.repository.getPinHash(identity.id);
    if (existingHash && existingHash !== pinHash) {
      await sendFinancialReply(message, 'That PIN is not correct. Try again or contact an estate admin.', options.send);
      return;
    }
    if (!existingHash) await options.repository.setPinHash(identity.id, pinHash);
    session.pinAuthenticated = true;
    session.expiresAt = expiry();
    await options.repository.saveSession(session);
    await sendFinancialReply(message, existingHash ? 'PIN verified.' : 'PIN set and verified for this session.', options.send);
    return;
  }

  const pinHash = await options.repository.getPinHash(identity.id);
  const forcePin = await options.repository.getForcePin();
  if ((forcePin || pinHash) && !session.pinAuthenticated) {
    await sendFinancialReply(message, 'Please reply PIN followed by your 4–6 digit PIN before viewing financial standing.', options.send);
    return;
  }

  const propertyStep = session.currentNode.match(/^property_selection:(.+)$/);
  const item = propertyStep ? (propertyStep[1] as FinancialMenuItem) : parseMenuItem(text);
  if (text.toLowerCase() === 'menu' || text === '0' || !item) {
    session.currentNode = 'menu';
    session.expiresAt = expiry();
    await options.repository.saveSession(session);
    await sendFinancialReply(message, menuText(), options.send);
    return;
  }

  const houses = await options.repository.getBillableHouses(identity.id);
  if (houses.length === 0) {
    await sendFinancialReply(message, 'Your Resident record is connected to the community tier. Financial standing is not available for this role.', options.send);
    return;
  }

  if (propertyStep) {
    const selectedIndex = Number.parseInt(text, 10) - 1;
    if (!Number.isInteger(selectedIndex) || !houses[selectedIndex]) {
      await sendFinancialReply(message, propertyText(houses, item), options.send);
      return;
    }
    session.selectedHouseId = houses[selectedIndex].id;
  } else if (!session.selectedHouseId || !houses.some((house) => house.id === session.selectedHouseId)) {
    if (houses.length > 1) {
      session.currentNode = `property_selection:${item}`;
      session.expiresAt = expiry();
      await options.repository.saveSession(session);
      await sendFinancialReply(message, propertyText(houses, item), options.send);
      return;
    }
    session.selectedHouseId = houses[0].id;
  }

  const houseId = session.selectedHouseId;
  if (!houseId) return;
  const answer = item === 'balance'
    ? await options.repository.getBalance(identity.id, houseId)
    : item === 'last_payment'
      ? await options.repository.getLastPayment(identity.id, houseId)
      : item === 'next_due'
        ? await options.repository.getNextDue(identity.id, houseId)
        : await options.repository.getWallet(identity.id);
  const body = `${answer.body}${!pinHash ? '\nTip: reply PIN 1234 to lock financial answers.' : ''}`;
  await sendFinancialReply(message, body, options.send);
  await options.repository.logDisclosure({
    residentId: identity.id,
    phoneNumber,
    houseId,
    menuItem: item,
    pinAuthenticated: session.pinAuthenticated,
    metadata: answer.metadata,
  });
  session.currentNode = 'menu';
  session.expiresAt = expiry();
  await options.repository.saveSession(session);
}

export function createSupabaseWhatsAppFinancialRepository(): WhatsAppFinancialRepository {
  return createSupabaseRepository();
}
