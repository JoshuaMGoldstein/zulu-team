-- 1. Ensure Row Level Security is enabled for the 'users' table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies on the 'users' table to avoid conflicts
--    (This will drop all policies owned by the 'authenticated' role on the 'users' table)
DROP POLICY IF EXISTS "Allow authenticated users to read their own user record" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to insert their own user record" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to update their own user record" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own user record" ON public.users;
DROP POLICY IF EXISTS "Users can update their own user record" ON public.users;
DROP POLICY IF EXISTS "Users can view their own user record" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to read all users (DEBUG)" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to insert any user record (DEBUG)" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to update any user record (DEBUG)" ON public.users;


-- 3. Policy for SELECT (Read): Authenticated users can view their own user record.
CREATE POLICY "Allow authenticated users to read their own user record"
ON public.users FOR SELECT TO authenticated
USING (auth.uid() = id);

-- 4. Policy for INSERT (Create): Authenticated users can insert a user record if its ID matches their auth.uid().
CREATE POLICY "Allow authenticated users to insert their own user record"
ON public.users FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- 5. Policy for UPDATE (Update): Authenticated users can update their own user record.
CREATE POLICY "Allow authenticated users to update their own user record"
ON public.users FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);