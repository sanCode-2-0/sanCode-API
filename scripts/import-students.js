const ExcelJS = require('exceljs');
const path = require('path');
const { supabase } = require('../config/supabase/config.js');
const { studentTableName } = require('../config/database.js');

// Configuration per pathway
const PATHWAY_CONFIG = {
  'arts-sports': {
    file: 'GRADE 10 ADMISSION ARTS AND SPORTS AS AT 11 JAN 2026.xlsx',
    pathwayName: 'Arts & Sports Science'
  },
  'social-sciences': {
    file: 'GRADE 10 ADMISSION SOCIAL SCIENCES AS AT 12TH JAN 2026  .xlsx',
    pathwayName: 'Social Sciences'
  },
  'stem': {
    file: 'GRADE 10 ADMISSION STEM AS AT 12TH JAN 2026  (3).xlsx',
    pathwayName: 'STEM'
  }
};

// Parse full name into parts
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

// Get cell value safely
function getCellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  if (typeof cell.value === 'object' && cell.value.text) return cell.value.text;
  if (typeof cell.value === 'object' && cell.value.result) return cell.value.result;
  return cell.value;
}

async function importStudents(pathway) {
  const config = PATHWAY_CONFIG[pathway];
  if (!config) {
    console.error(`Unknown pathway: ${pathway}`);
    console.log('Available pathways: arts-sports, social-sciences, stem');
    process.exit(1);
  }

  console.log(`\n=== Importing ${config.pathwayName} students ===\n`);

  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../temp_data', config.file);

  console.log(`Reading file: ${config.file}`);

  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    console.error(`Failed to read Excel file: ${err.message}`);
    process.exit(1);
  }

  // Use first worksheet (main summary sheet)
  const worksheet = workbook.worksheets[0];
  console.log(`Worksheet: ${worksheet.name}`);
  console.log(`Rows: ${worksheet.rowCount}`);

  const students = [];
  const errors = [];
  const duplicates = [];
  let skippedRows = 0;

  // Find header row and column indices
  let headerRow = null;
  let columnMap = {};

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const firstCell = getCellValue(row.getCell(1));

    // Look for header row (contains "S/N" or "S/n" in first column)
    if (!headerRow && firstCell && String(firstCell).toLowerCase().includes('s/n')) {
      headerRow = rowNumber;
      // Map column names to indices
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const val = getCellValue(cell);
        if (val) {
          const header = String(val).toLowerCase().trim();
          if (header.includes('school')) columnMap.schoolNo = colNumber;
          if (header.includes('name') && !header.includes('path')) columnMap.name = colNumber;
          if (header.includes('pathway')) columnMap.pathway = colNumber;
          if (header.includes('grade') || header === '10' || header.includes('class')) columnMap.class = colNumber;
          if (header.includes('house')) columnMap.house = colNumber;
          if (header.includes('subject') || header.includes('combination')) columnMap.subjectCombination = colNumber;
        }
      });
      console.log(`Header row found at row ${rowNumber}`);
      console.log(`Column mapping:`, columnMap);
      return;
    }

    // Skip rows before header
    if (!headerRow) return;

    // Skip header row itself
    if (rowNumber === headerRow) return;

    // Parse data row
    const schoolNo = getCellValue(row.getCell(columnMap.schoolNo || 2));
    const fullName = getCellValue(row.getCell(columnMap.name || 4));
    const pathwayVal = getCellValue(row.getCell(columnMap.pathway || 5));
    const studentClass = getCellValue(row.getCell(columnMap.class || 6));
    const house = getCellValue(row.getCell(columnMap.house || 7));
    const subjectCombination = getCellValue(row.getCell(columnMap.subjectCombination || 8));

    // Validate required fields
    if (!schoolNo || !fullName) {
      skippedRows++;
      return;
    }

    // Parse admission number (school no)
    const admNo = parseInt(schoolNo);
    if (isNaN(admNo)) {
      errors.push({ row: rowNumber, reason: `Invalid school number: ${schoolNo}` });
      return;
    }

    const parsedName = parseName(fullName);

    students.push({
      admNo: admNo,
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

  console.log(`\nParsed ${students.length} students from Excel`);
  console.log(`Skipped ${skippedRows} empty/invalid rows`);

  if (students.length === 0) {
    console.log('No students to import!');
    return { total: 0, imported: 0, duplicates: [], errors };
  }

  // Import to Supabase with duplicate checking
  console.log('\nImporting to Supabase...\n');
  let imported = 0;

  for (let i = 0; i < students.length; i++) {
    const student = students[i];

    // Check if student exists
    const { data: existing, error: selectError } = await supabase
      .from(studentTableName)
      .select('admNo')
      .eq('admNo', student.admNo);

    if (selectError) {
      errors.push({ admNo: student.admNo, error: selectError.message });
      continue;
    }

    if (existing && existing.length > 0) {
      duplicates.push(student.admNo);
      continue;
    }

    // Insert new student
    const { error: insertError } = await supabase
      .from(studentTableName)
      .insert([student]);

    if (insertError) {
      errors.push({ admNo: student.admNo, error: insertError.message });
    } else {
      imported++;
      if (imported % 50 === 0) {
        console.log(`  Imported ${imported} students...`);
      }
    }
  }

  const result = {
    pathway: config.pathwayName,
    total: students.length,
    imported: imported,
    duplicates: duplicates,
    duplicateCount: duplicates.length,
    errors: errors,
    errorCount: errors.length
  };

  console.log('\n=== Import Complete ===');
  console.log(`Pathway: ${result.pathway}`);
  console.log(`Total parsed: ${result.total}`);
  console.log(`Successfully imported: ${result.imported}`);
  console.log(`Duplicates skipped: ${result.duplicateCount}`);
  console.log(`Errors: ${result.errorCount}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 10).forEach(e => console.log(`  - ${JSON.stringify(e)}`));
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }

  return result;
}

// CLI invocation
const pathway = process.argv[2];
if (!pathway) {
  console.log('Usage: node import-students.js <arts-sports|social-sciences|stem>');
  console.log('\nPathways:');
  console.log('  arts-sports     - Arts & Sports Science (~60 students)');
  console.log('  social-sciences - Social Sciences (~119 students)');
  console.log('  stem            - STEM (~404 students)');
  process.exit(1);
}

importStudents(pathway)
  .then(result => {
    // Output JSON result for parsing
    console.log('\n--- JSON Result ---');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
