import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uaywqggaaaqxtdyopvuz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KLtelpzxKavkIOTKTb1lhg_rahQ0Oa8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
