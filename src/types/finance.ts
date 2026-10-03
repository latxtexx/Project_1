export type AccountType = 'cash' | 'bank' | 'credit_card' | 'savings' | 'investment';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  currentBalance: number;
  creditLimit?: number;
  statementClosingDay?: number;
  paymentDueDay?: number;
  isLiquid: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  parentId?: string | null;
  icon?: string;
  color?: string;
  type: TransactionType;
  isFixedObligation: boolean;
  createdAt: string;
}

export interface RecurringRule {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate?: string | null;
  nextOccurrence: string;
  autoCreate: boolean;
  description?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
  categoryId: string;
  recurringRuleId?: string | null;
  transactedAt: string;
  tags?: string[];
  notes?: string;
  isCleared: boolean;
  createdAt: string;
}

export interface Budget {
  id: string;
  userId: string;
  categoryId: string;
  periodMonth: string; // YYYY-MM-01
  allocatedAmount: number;
  savingsTarget: number;
  createdAt: string;
}

export interface UpcomingObligation {
  id: string;
  name: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  accountId?: string;
  isCreditCardSettlement?: boolean;
}
