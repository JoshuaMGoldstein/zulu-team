-- Temporarily enable RLS and add a very permissive INSERT policy for accounts
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on the 'accounts' table to ensure no conflicts
DROP POLICY IF EXISTS "Allow account admins to manage associated accounts" ON public.accounts;
DROP POLICY IF EXISTS "Allow authenticated users to create accounts" ON public.accounts;
DROP POLICY IF EXISTS "Allow authenticated users to view their associated accounts" ON public.accounts;

-- Add a very permissive INSERT policy for authenticated users
CREATE POLICY "TEMP_Allow_All_Authenticated_Inserts_Accounts"
ON public.accounts FOR INSERT TO authenticated
WITH CHECK (TRUE);
