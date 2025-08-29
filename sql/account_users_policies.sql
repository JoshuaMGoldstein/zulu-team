-- 1. Ensure Row Level Security is enabled for the 'account_users' table
ALTER TABLE public.account_users ENABLE ROW LEVEL SECURITY;

-- 2. Drop all existing policies on the 'account_users' table to avoid conflicts
DROP POLICY IF EXISTS "Users can view their account_user records" ON public.account_users;
DROP POLICY IF EXISTS "Admins can manage account_user records" ON public.account_users;
DROP POLICY IF EXISTS "Allow authenticated users to read their own account_user records" ON public.account_users;
DROP POLICY IF EXISTS "Allow authenticated users to insert their own account_user records" ON public.account_users;
DROP POLICY IF EXISTS "Allow authenticated users to update their own account_user records" ON public.account_users;
DROP POLICY IF EXISTS "Allow account admins to manage all account_user records in their accounts" ON public.account_users;

-- 3. Create a SECURITY DEFINER function to check for account admin status, bypassing RLS
CREATE OR REPLACE FUNCTION public.is_account_admin(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.account_users
    WHERE account_id = p_account_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
END;
$$;

-- 4. Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.is_account_admin(uuid) TO authenticated;

-- 5. Policy for SELECT (Read): Authenticated users can view their own account_user records.
CREATE POLICY "Allow authenticated users to read their own account_user records"
ON public.account_users FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 6. Policy for INSERT (Create): Authenticated users can insert their own account_user records.
CREATE POLICY "Allow authenticated users to insert their own account_user records"
ON public.account_users FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 7. Policy for UPDATE (Update): Authenticated users can update their own account_user records.
CREATE POLICY "Allow authenticated users to update their own account_user records"
ON public.account_users FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 8. Policy for ALL (Manage): Account admins can manage all account_user records within their accounts.
--    This policy now uses the is_account_admin function to avoid recursion.
CREATE POLICY "Allow account admins to manage all account_user records in their accounts"
ON public.account_users FOR ALL TO authenticated
USING (public.is_account_admin(account_id))
WITH CHECK (public.is_account_admin(account_id));