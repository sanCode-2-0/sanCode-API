const ExcelJS = require('exceljs');
const path = require('path');
const { supabase } = require('../config/supabase/config.js');
const { studentTableName } = require('../config/database.js');

// Get cell value safely
function getCellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  if (typeof cell.value === 'object' && cell.value.text) return cell.value.text;
  if (typeof cell.value === 'object' && cell.value.result) return cell.value.result;
  return cell.value;
}

async function fixStemClasses() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../temp_data', 'GRADE 10 ADMISSION STEM AS AT 12TH JAN 2026  (3).xlsx');

  console.log('Reading STEM Excel file...');
  await workbook.xlsx.readFile(filePath);

  // Build a map of admNo -> class from individual sheets
  const classMap = new Map();

  // Skip the first sheet (STEM summary), process individual class sheets
  for (let i = 1; i < workbook.worksheets.length; i++) {
    const ws = workbook.worksheets[i];
    const sheetName = ws.name;
    console.log(`Processing sheet: ${sheetName}`);

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= 2) return; // Skip title and header rows

      const schoolNo = getCellValue(row.getCell(2)); // Column B: School No
      const studentClass = getCellValue(row.getCell(6)); // Column F: Grade 10

      if (schoolNo && studentClass) {
        const admNo = parseInt(schoolNo);
        if (!isNaN(admNo)) {
          classMap.set(admNo, String(studentClass).toUpperCase());
        }
      }
    });
  }

  console.log(`\nFound class assignments for ${classMap.size} students`);

  // Update students in database
  console.log('\nUpdating database...');
  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const [admNo, studentClass] of classMap) {
    const { data, error } = await supabase
      .from(studentTableName)
      .update({ class: studentClass })
      .eq('admNo', admNo)
      .eq('pathway', 'STEM')
      .select('admNo');

    if (error) {
      console.log(`Error updating ${admNo}: ${error.message}`);
      errors++;
    } else if (data && data.length > 0) {
      updated++;
      if (updated % 50 === 0) {
        console.log(`  Updated ${updated} students...`);
      }
    } else {
      notFound++;
    }
  }

  console.log('\n=== Fix Complete ===');
  console.log(`Updated: ${updated}`);
  console.log(`Not found in DB: ${notFound}`);
  console.log(`Errors: ${errors}`);

  // Verify
  console.log('\nVerifying...');
  const { data: sample } = await supabase
    .from(studentTableName)
    .select('admNo, fName, sName, class')
    .eq('pathway', 'STEM')
    .not('class', 'is', null)
    .limit(10);

  console.log('\nSample STEM students with classes:');
  sample.forEach(s => console.log(`  ${s.admNo}: ${s.fName} ${s.sName} - ${s.class}`));
}

fixStemClasses().catch(console.error);
