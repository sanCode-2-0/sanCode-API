const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase/config.js');
const { studentTableName } = require('../config/database.js');

// Parse full name into fName, sName, tName, fourthName
function parseName(fullName) {
  if (!fullName) return { fName: '', sName: '', tName: null, fourthName: null };
  const parts = String(fullName).trim().split(/\s+/);
  return {
    fName: (parts[0] || '').toUpperCase(),
    sName: (parts[1] || '').toUpperCase(),
    tName: parts[2] ? parts[2].toUpperCase() : null,
    fourthName: parts.length > 3 ? parts.slice(3).join(' ').toUpperCase() : null
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const shouldApply = args.includes('--apply');
  const shouldInsertMissing = args.includes('--insert-missing');

  if (!isDryRun && !shouldApply) {
    console.log('Usage: node apply-class-reshuffle.js [--dry-run | --apply] [--insert-missing]');
    process.exit(1);
  }

  const jsonPath = path.join(__dirname, '../scratch/reshuffled_students.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: Data file not found at ' + jsonPath);
    process.exit(1);
  }

  const reshuffled = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log('\n=== Grade 10 Class Reshuffle Migration ===');
  console.log('Loaded ' + reshuffled.length + ' student records from PDFs.');
  console.log('Mode: ' + (isDryRun ? 'DRY-RUN (no database writes)' : 'APPLY (live database updates)'));
  console.log('Insert missing students: ' + (shouldInsertMissing ? 'YES' : 'NO') + '\n');

  const admNos = reshuffled.map(s => s.admNo);

  console.log('Fetching existing student records from Supabase...');
  let dbStudents = [];
  for (let i = 0; i < admNos.length; i += 200) {
    const chunk = admNos.slice(i, i + 200);
    const { data, error } = await supabase
      .from(studentTableName)
      .select('recordID, admNo, fName, sName, tName, fourthName, class, pathway, house, subjectCombination, graduationYear')
      .in('admNo', chunk);

    if (error) {
      console.error('Error fetching students from DB:', error.message);
      process.exit(1);
    }
    dbStudents = dbStudents.concat(data);
  }

  const dbMap = new Map();
  dbStudents.forEach(s => dbMap.set(s.admNo, s));
  console.log('Found ' + dbStudents.length + ' existing students in DB.\n');

  const toUpdate = [];
  const alreadyCorrect = [];
  const missingInDb = [];

  for (const s of reshuffled) {
    const inDb = dbMap.get(s.admNo);
    if (!inDb) {
      missingInDb.push(s);
    } else if (inDb.class === s.new_class) {
      alreadyCorrect.push({ admNo: s.admNo, class: s.new_class });
    } else {
      toUpdate.push({
        recordID: inDb.recordID,
        admNo: s.admNo,
        name: s.name,
        oldClass: inDb.class,
        newClass: s.new_class,
        rawDb: inDb
      });
    }
  }

  console.log('Summary of Categorization:');
  console.log('  - Class needs update    : ' + toUpdate.length);
  console.log('  - Class already correct : ' + alreadyCorrect.length);
  console.log('  - Not in database        : ' + missingInDb.length);

  if (isDryRun) {
    console.log('\n--- DRY-RUN PREVIEW ---');
    console.log('Sample updates (first 5):');
    toUpdate.slice(0, 5).forEach(u => {
      console.log('  AdmNo ' + u.admNo + ': \'' + u.oldClass + '\' -> \'' + u.newClass + '\' (' + u.name + ')');
    });
    if (missingInDb.length > 0) {
      console.log('\nMissing in DB (all):');
      missingInDb.forEach(m => {
        console.log('  AdmNo ' + m.admNo + ': ' + m.name + ' -> Class ' + m.new_class + ' (Source: ' + m.source_file + ')');
      });
    }
    console.log('\nDry-run complete. No changes made.');
    return;
  }

  // 1. Create a backup of all students that will be modified
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, 'reshuffle_backup_' + timestamp + '.json');
  
  const backupData = {
    timestamp: new Date().toISOString(),
    totalStudentsToUpdate: toUpdate.length,
    updates: toUpdate.map(u => ({
      admNo: u.admNo,
      previousClass: u.oldClass,
      newClass: u.newClass
    })),
    rawRecords: toUpdate.map(u => u.rawDb)
  };
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log('\nBackup created at: ' + backupFile);

  // 2. Perform updates in batches
  console.log('\nApplying ' + toUpdate.length + ' class updates to Supabase...');
  let updatedCount = 0;
  let updateErrors = 0;

  for (const item of toUpdate) {
    const { error } = await supabase
      .from(studentTableName)
      .update({ class: item.newClass })
      .eq('admNo', item.admNo);

    if (error) {
      updateErrors++;
      console.error('Error updating AdmNo ' + item.admNo + ': ' + error.message);
    } else {
      updatedCount++;
      if (updatedCount % 50 === 0 || updatedCount === toUpdate.length) {
        console.log('  Updated ' + updatedCount + '/' + toUpdate.length + ' students...');
      }
    }
  }

  // 3. Insert missing students if requested
  let insertedCount = 0;
  let insertErrors = 0;

  if (shouldInsertMissing && missingInDb.length > 0) {
    console.log('\nInserting ' + missingInDb.length + ' new students into ' + studentTableName + '...');
    for (const m of missingInDb) {
      const parsed = parseName(m.name);
      const newRecord = {
        admNo: m.admNo,
        fName: parsed.fName,
        sName: parsed.sName,
        tName: parsed.tName,
        fourthName: parsed.fourthName,
        class: m.new_class,
        going_to_hospital: 0
      };

      const { error } = await supabase
        .from(studentTableName)
        .insert([newRecord]);

      if (error) {
        insertErrors++;
        console.error('Error inserting AdmNo ' + m.admNo + ': ' + error.message);
      } else {
        insertedCount++;
        console.log('  Inserted AdmNo ' + m.admNo + ': ' + m.name + ' -> ' + m.new_class);
      }
    }
  }

  console.log('\n=== Migration Completed ===');
  console.log('Updates succeeded : ' + updatedCount);
  console.log('Updates failed    : ' + updateErrors);
  console.log('Inserts succeeded : ' + insertedCount);
  console.log('Inserts failed    : ' + insertErrors);
  console.log('Backup saved to   : ' + backupFile);
}

main().catch(err => {
  console.error('Fatal error in migration:', err);
  process.exit(1);
});
