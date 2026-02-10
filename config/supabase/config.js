const { createClient } = require("@supabase/supabase-js");
const { KEYS } = require("../keys.js");

const supabaseUrl = "https://hqaaeofsktwmuiybldpe.supabase.co";
const supabaseKey = KEYS.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Supabase Auth
async function signInWithEmail() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: KEYS.SUPABASE_EMAIL,
    password: KEYS.SUPABASE_PASSWORD,
  });

  return { data, error };
}

module.exports = { supabase, signInWithEmail };