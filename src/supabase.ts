import { createClient } from '@supabase/supabase-js'
import {Database as ConfigSchema} from './db/config.types'
import {Database as PublicSchema} from './db/public.types'
import * as dotenv from 'dotenv';

dotenv.config();

export enum PSQLERROR {
  NORESULTS = 'PGRST116'
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY


if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
}

export const configdb = createClient<ConfigSchema>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const publicdb = createClient<PublicSchema>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});