-- Enable RLS and add minimal policies for public tables.
-- Run in Supabase SQL Editor.

-- PRODUCTS (read-only; write from backend/service role)
alter table public.products enable row level security;

drop policy if exists "products_read_all" on public.products;
create policy "products_read_all"
on public.products
for select
using (true);

-- USER_LIBRARY (user can read/write only their rows)
alter table public.user_library enable row level security;

drop policy if exists "user_library_read_own" on public.user_library;
create policy "user_library_read_own"
on public.user_library
for select
using (auth.uid() = user_id);

drop policy if exists "user_library_insert_own" on public.user_library;
create policy "user_library_insert_own"
on public.user_library
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_library_delete_own" on public.user_library;
create policy "user_library_delete_own"
on public.user_library
for delete
using (auth.uid() = user_id);

-- RC_CUSTOMERS (read-only to owner; writes only from backend/service role)
alter table public.rc_customers enable row level security;

drop policy if exists "rc_customers_read_own" on public.rc_customers;
create policy "rc_customers_read_own"
on public.rc_customers
for select
using (auth.uid() = user_id);

-- STORE_TRANSACTIONS (read-only to owner; writes only from backend/service role)
alter table public.store_transactions enable row level security;

drop policy if exists "store_transactions_read_own" on public.store_transactions;
create policy "store_transactions_read_own"
on public.store_transactions
for select
using (auth.uid() = user_id);
