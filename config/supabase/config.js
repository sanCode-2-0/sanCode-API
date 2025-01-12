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

// import { createClient } from '@supabase/supabase-js'
// const supabaseUrl = "https://paomvkbtngloumkimhyj.supabase.co"
// const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhb212a2J0bmdsb3Vta2ltaHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk4Nzk4NzQsImV4cCI6MjAyNTQ1NTg3NH0.oMFvrXFATZ7-WmEI6jIxARqvkoFtZ4wadNMYy669kOE"
// export const CDNURL = `${supabaseUrl}/storage/v1/object/public`
// // Create a single supabase client for interacting with your database
// export const supabase = createClient(supabaseUrl, supabaseKey, {
//     auth: {
//         autoRefreshToken: true,
//         persistSession: true,
//         detectSessionInUrl: true
//     },
// })

// // Supabase Auth
// export async function signInWithEmail() {
//     const { data, error } = await supabase.auth.signInWithPassword({
//         email: 'kapolonbraine@gmail.com',
//         password: 'briomar2020',
//     })

//     return { data, error }
// }
