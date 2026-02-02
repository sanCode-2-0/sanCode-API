const { supabase } = require('../config/supabase/config.js');

async function checkClasses() {
  // Get all students with pathway (newly imported)
  const { data, error } = await supabase
    .from('sanCodeStudent')
    .select('admNo, fName, sName, class, pathway')
    .not('pathway', 'is', null)
    .order('pathway')
    .limit(100);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('=== Sample of imported students with class values ===\n');

  // Group by pathway
  const byPathway = {};
  data.forEach(s => {
    if (!byPathway[s.pathway]) byPathway[s.pathway] = [];
    byPathway[s.pathway].push(s);
  });

  for (const [pathway, students] of Object.entries(byPathway)) {
    console.log(`\n--- ${pathway} ---`);
    students.slice(0, 15).forEach(s => {
      console.log(`  ${s.admNo}: ${s.fName} ${s.sName} | class: '${s.class}'`);
    });
  }

  // Count class values for imported students
  const { data: allImported } = await supabase
    .from('sanCodeStudent')
    .select('class')
    .not('pathway', 'is', null);

  const classCounts = {};
  allImported.forEach(r => {
    const cls = r.class === null ? 'NULL' : (r.class === '' ? 'EMPTY' : r.class);
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  });

  console.log('\n\n=== Class value distribution (imported students) ===');
  Object.entries(classCounts).sort((a,b) => b[1] - a[1]).forEach(([cls, count]) => {
    console.log(`  '${cls}': ${count}`);
  });
}

checkClasses();
