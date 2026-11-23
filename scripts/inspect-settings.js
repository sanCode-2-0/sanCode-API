
const { supabase } = require('./config/supabase/config.js');
async function inspectSettings() {
  const { data, error } = await supabase.from('sanCodeSettings').select('*');
  console.log(data);
}
inspectSettings().catch(console.error);
