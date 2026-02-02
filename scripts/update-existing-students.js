const ExcelJS = require('exceljs');
const path = require('path');
const { supabase } = require('../config/supabase/config.js');
const { studentTableName } = require('../config/database.js');

// Configuration per pathway
const PATHWAY_CONFIG = {
  'arts-sports': {
    file: 'GRADE 10 ADMISSION ARTS AND SPORTS AS AT 11 JAN 2026.xlsx',
    pathwayName: 'Arts & Sports Science',
    useFirstSheet: true
  },
  'social-sciences': {
    file: 'GRADE 10 ADMISSION SOCIAL SCIENCES AS AT 12TH JAN 2026  .xlsx',
    pathwayName: 'Social Sciences',
    useFirstSheet: true
  },
  'stem': {
    file: 'GRADE 10 ADMISSION STEM AS AT 12TH JAN 2026  (3).xlsx',
    pathwayName: 'STEM',
    useFirstSheet: false // Use individual class sheets for STEM
  }
};

function getCellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  if (typeof cell.value === 'object' && cell.value.text) return cell.value.text;
  if (typeof cell.value === 'object' && cell.value.result) return cell.value.result;
  return cell.value;
}

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

async function updateExistingStudents(pathway) {
  const config = PATHWAY_CONFIG[pathway];
  if (!config) {
    console.error(`Unknown pathway: ${pathway}`);
    process.exit(1);
  }

  console.log(`\n=== Updating existing ${config.pathwayName} students ===\n`);

  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../temp_data', config.file);
  await workbook.xlsx.readFile(filePath);

  const students = [];

  if (config.useFirstSheet) {
    // Arts & Sports and Social Sciences - use first sheet
    const worksheet = workbook.worksheets[0];
    console.log(`Reading from sheet: ${worksheet.name}`);

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= 2) return;

      const schoolNo = getCellValue(row.getCell(2));
      const fullName = getCellValue(row.getCell(4));
      const pathwayVal = getCellValue(row.getCell(5));
      const studentClass = getCellValue(row.getCell(6));
      const house = getCellValue(row.getCell(7));
      const subjectCombination = getCellValue(row.getCell(8));

      if (!schoolNo) return;

      const admNo = parseInt(schoolNo);
      if (isNaN(admNo)) return;

      const parsedName = parseName(fullName);

      students.push({
        admNo,
        fName: parsedName.fName,
        sName: parsedName.sName,
        tName: parsedName.tName,
        fourthName: parsedName.fourthName,
        class: studentClass ? String(studentClass).toUpperCase() : null,
        pathway: pathwayVal ? String(pathwayVal) : config.pathwayName,
        house: house ? String(house) : null,
        subjectCombination: subjectCombination ? String(subjectCombination) : null
      });
    });
  } else {
    // STEM - use individual class sheets (skip first summary sheet)
    for (let i = 1; i < workbook.worksheets.length; i++) {
      const ws = workbook.worksheets[i];
      console.log(`Reading from sheet: ${ws.name}`);

      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= 2) return;

        const schoolNo = getCellValue(row.getCell(2));
        const fullName = getCellValue(row.getCell(4));
        const pathwayVal = getCellValue(row.getCell(5));
        const studentClass = getCellValue(row.getCell(6));
        const house = getCellValue(row.getCell(7));
        const subjectCombination = getCellValue(row.getCell(8));

        if (!schoolNo) return;

        const admNo = parseInt(schoolNo);
        if (isNaN(admNo)) return;

        const parsedName = parseName(fullName);

        students.push({
          admNo,
          fName: parsedName.fName,
          sName: parsedName.sName,
          tName: parsedName.tName,
          fourthName: parsedName.fourthName,
          class: studentClass ? String(studentClass).toUpperCase() : null,
          pathway: pathwayVal ? String(pathwayVal) : config.pathwayName,
          house: house ? String(house) : null,
          subjectCombination: subjectCombination ? String(subjectCombination) : null
        });
      });
    }
  }

  console.log(`\nParsed ${students.length} students from Excel`);

  // Update existing students
  let updated = 0;
  let notFound = 0;
  let errors = 0;

  console.log('\nUpdating database...\n');

  for (const student of students) {
    const { data, error } = await supabase
      .from(studentTableName)
      .update({
        fName: student.fName,
        sName: student.sName,
        tName: student.tName,
        fourthName: student.fourthName,
        class: student.class,
        pathway: student.pathway,
        house: student.house,
        subjectCombination: student.subjectCombination
      })
      .eq('admNo', student.admNo)
      .select('admNo');

    if (error) {
      errors++;
      console.log(`Error updating ${student.admNo}: ${error.message}`);
    } else if (data && data.length > 0) {
      updated++;
      if (updated % 50 === 0) {
        console.log(`  Updated ${updated} students...`);
      }
    } else {
      notFound++;
    }
  }

  console.log('\n=== Update Complete ===');
  console.log(`Total in Excel: ${students.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found in DB: ${notFound}`);
  console.log(`Errors: ${errors}`);

  return { total: students.length, updated, notFound, errors };
}

// CLI
const pathway = process.argv[2];
if (!pathway) {
  console.log('Usage: node update-existing-students.js <arts-sports|social-sciences|stem>');
  process.exit(1);
}

updateExistingStudents(pathway).catch(console.error);
