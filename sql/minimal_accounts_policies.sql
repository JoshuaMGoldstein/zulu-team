-- 1. Ensure Row Level Security is enabled for the 'accounts' table
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing policies on the 'accounts' table to ensure a clean slate
DROP POLICY IF EXISTS "Allow authenticated users to create accounts" ON public.accounts;
DROP POLICY IF EXISTS "Allow authenticated users to view their associated accounts" ON public.accounts;
DROP POLICY IF EXISTS "Allow account admins to update accounts" ON public.accounts;
DROP POLICY IF EXISTS "Allow account admins to delete accounts" ON public.accounts;
DROP POLICY IF EXISTS "Admins can manage their own account" ON public.accounts;
DROP POLICY IF EXISTS "Users can view their own account" ON public.accounts;
DROP POLICY IF EXISTS "Allow account admins to manage associated accounts" ON public.accounts;

-- 3. Policy for INSERT (Create): Allow authenticated users to create new accounts.
CREATE POLICY "Allow authenticated users to create accounts"
ON public.accounts FOR INSERT TO authenticated
WITH CHECK (TRUE); -- No specific check needed on creation, as account_users link will be made separately

-- 4. Policy for SELECT (Read): Allow authenticated users to view accounts they are associated with.
CREATE POLICY "Allow authenticated users to view their associated accounts"
ON public.accounts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.account_users WHERE account_id = accounts.id AND user_id = auth.uid()));
