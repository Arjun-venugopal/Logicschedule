import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

let supabaseInstance: SupabaseClient | null = null;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseUrl.trim() !== '' &&
    !supabaseUrl.includes('your-project-id') &&
    supabaseServiceRoleKey &&
    supabaseServiceRoleKey.trim() !== '' &&
    !supabaseServiceRoleKey.includes('your-supabase-service-role-key')
  );
};

export const getSupabase = (): SupabaseClient => {
  if (!supabaseInstance) {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.'
      );
    }
    supabaseInstance = createClient(supabaseUrl!, supabaseServiceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseInstance;
};

export const connectSupabase = async (): Promise<boolean> => {
  try {
    if (!isSupabaseConfigured()) {
      console.log('ℹ️  Supabase credentials not found or incomplete in .env. Skipping Supabase connection.');
      return false;
    }

    const client = getSupabase();
    // Test connection by querying the users table or checking health
    const { error } = await client.from('users').select('count', { count: 'exact', head: true });
    
    if (error && error.code !== 'PGRST116') {
      console.warn(`⚠️  Supabase connected with warning: ${error.message}`);
      return true;
    }

    console.log('✅ Supabase Client Initialized and Connected successfully.');
    return true;
  } catch (error: any) {
    console.error(`❌ Supabase connection failed: ${error.message}`);
    return false;
  }
};

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl!, supabaseServiceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : (null as unknown as SupabaseClient);
