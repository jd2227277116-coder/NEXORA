import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ihspqxyacwpmuqdqgzhm.supabase.co";

const supabaseKey =
  "sb_publishable_0EHzEPLRXrSImT4vmpO4eA_L4uQ7CeL";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);