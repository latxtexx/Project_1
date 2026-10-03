-- ============================================================================
-- Personal Expense & Cash Flow Management Database Schema
-- Compatible with PostgreSQL 15+ and Supabase
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUM TYPES
DO $$ BEGIN
    CREATE TYPE account_type AS ENUM ('cash', 'bank', 'credit_card', 'savings', 'investment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE recurrence_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    type account_type NOT NULL DEFAULT 'bank',
    currency VARCHAR(3) NOT NULL DEFAULT 'THB',
    current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    credit_limit NUMERIC(15, 2) DEFAULT 0.00,
    statement_closing_day INT CHECK (statement_closing_day BETWEEN 1 AND 31),
    payment_due_day INT CHECK (payment_due_day BETWEEN 1 AND 31),
    is_liquid BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    icon VARCHAR(50),
    color VARCHAR(20),
    type transaction_type NOT NULL,
    is_fixed_obligation BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. RECURRING SCHEDULES TABLE
CREATE TABLE IF NOT EXISTS public.recurring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    type transaction_type NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    frequency recurrence_frequency NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    next_occurrence DATE NOT NULL,
    auto_create BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type transaction_type NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    source_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
    destination_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
    recurring_rule_id UUID REFERENCES public.recurring_rules(id) ON DELETE SET NULL,
    transacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    is_cleared BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT check_transaction_accounts CHECK (
        (type = 'income' AND destination_account_id IS NOT NULL) OR
        (type = 'expense' AND source_account_id IS NOT NULL) OR
        (type = 'transfer' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL 
                          AND source_account_id <> destination_account_id)
    )
);

-- 6. BUDGETS TABLE
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    period_month DATE NOT NULL,
    allocated_amount NUMERIC(15, 2) NOT NULL CHECK (allocated_amount >= 0),
    savings_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, category_id, period_month)
);

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, transacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_source_acc ON public.transactions(source_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_dest_acc ON public.transactions(destination_account_id);
CREATE INDEX IF NOT EXISTS idx_recurring_next_occurrence ON public.recurring_rules(next_occurrence) WHERE auto_create = true;

-- 8. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY account_isolation_policy ON public.accounts FOR ALL USING (auth.uid() = user_id);
    CREATE POLICY category_isolation_policy ON public.categories FOR ALL USING (auth.uid() = user_id);
    CREATE POLICY transaction_isolation_policy ON public.transactions FOR ALL USING (auth.uid() = user_id);
    CREATE POLICY recurring_isolation_policy ON public.recurring_rules FOR ALL USING (auth.uid() = user_id);
    CREATE POLICY budget_isolation_policy ON public.budgets FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 9. TRIGGER: Auto-update Account Balances on Transaction change
CREATE OR REPLACE FUNCTION public.sync_account_balance_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
    -- กรณี INSERT รายการใหม่
    IF TG_OP = 'INSERT' THEN
        IF NEW.type = 'income' THEN
            UPDATE public.accounts 
            SET current_balance = current_balance + NEW.amount, updated_at = NOW() 
            WHERE id = NEW.destination_account_id;
        ELSIF NEW.type = 'expense' THEN
            UPDATE public.accounts 
            SET current_balance = current_balance - NEW.amount, updated_at = NOW() 
            WHERE id = NEW.source_account_id;
        ELSIF NEW.type = 'transfer' THEN
            UPDATE public.accounts 
            SET current_balance = current_balance - NEW.amount, updated_at = NOW() 
            WHERE id = NEW.source_account_id;
            UPDATE public.accounts 
            SET current_balance = current_balance + NEW.amount, updated_at = NOW() 
            WHERE id = NEW.destination_account_id;
        END IF;

    -- กรณี DELETE รายการ
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.type = 'income' THEN
            UPDATE public.accounts 
            SET current_balance = current_balance - OLD.amount, updated_at = NOW() 
            WHERE id = OLD.destination_account_id;
        ELSIF OLD.type = 'expense' THEN
            UPDATE public.accounts 
            SET current_balance = current_balance + OLD.amount, updated_at = NOW() 
            WHERE id = OLD.source_account_id;
        ELSIF OLD.type = 'transfer' THEN
            UPDATE public.accounts 
            SET current_balance = current_balance + OLD.amount, updated_at = NOW() 
            WHERE id = OLD.source_account_id;
            UPDATE public.accounts 
            SET current_balance = current_balance - OLD.amount, updated_at = NOW() 
            WHERE id = OLD.destination_account_id;
        END IF;

    -- กรณี UPDATE รายการ (Revert ยอดเก่า แล้ว Apply ยอดใหม่)
    ELSIF TG_OP = 'UPDATE' THEN
        -- Revert OLD
        IF OLD.type = 'income' THEN
            UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.destination_account_id;
        ELSIF OLD.type = 'expense' THEN
            UPDATE public.accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.source_account_id;
        ELSIF OLD.type = 'transfer' THEN
            UPDATE public.accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.source_account_id;
            UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.destination_account_id;
        END IF;

        -- Apply NEW
        IF NEW.type = 'income' THEN
            UPDATE public.accounts SET current_balance = current_balance + NEW.amount, updated_at = NOW() WHERE id = NEW.destination_account_id;
        ELSIF NEW.type = 'expense' THEN
            UPDATE public.accounts SET current_balance = current_balance - NEW.amount, updated_at = NOW() WHERE id = NEW.source_account_id;
        ELSIF NEW.type = 'transfer' THEN
            UPDATE public.accounts SET current_balance = current_balance - NEW.amount, updated_at = NOW() WHERE id = NEW.source_account_id;
            UPDATE public.accounts SET current_balance = current_balance + NEW.amount, updated_at = NOW() WHERE id = NEW.destination_account_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_balance ON public.transactions;
CREATE TRIGGER trigger_sync_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_account_balance_on_transaction();
