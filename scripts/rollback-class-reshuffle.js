const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase/config.js');
const { studentTableName } = require('../config/database.js');

async function main() {
  const backupFile = process.argv[2];
  if (!backupFile) {
    console.log('Usage: node rollback-class-reshuffle.js <path-to-backup-json>');
    process.exit(1);
  }

  if (!fs.existsSync(backupFile)) {
    console.error('Backup file not found: ' + backupFile);
    process.exit(1);
  }

  const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  console.log('Rolling back ' + backupData.updates.length + ' student class updates from backup: ' + backupFile);

  let reverted = 0;
  let errors = 0;

  for (const item of backupData.updates) {
    const { error } = await supabase
      .from(studentTableName)
      .update({ class: item.previousClass })
      .eq('admNo', item.admNo);

    if (error) {
      errors++;
      console.error('Error rolling back ' + item.admNo + ': ' + error.message);
    } else {
      reverted++;
      if (reverted % 50 === 0 || reverted === backupData.updates.length) {
        console.log('  Reverted ' + reverted + '/' + backupData.updates.length + ' students...');
      }
    }
  }

  console.log('\nRollback complete!');
  console.log('Reverted : ' + reverted);
  console.log('Errors   : ' + errors);
}

main().catch(console.error);
