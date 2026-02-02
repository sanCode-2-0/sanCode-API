const ExcelJS = require('exceljs');
const path = require('path');

async function inspectExcel(filename) {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../temp_data', filename);

  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  console.log(`\n=== ${filename} ===`);
  console.log(`Worksheet: ${worksheet.name}`);
  console.log(`Rows: ${worksheet.rowCount}, Columns: ${worksheet.columnCount}`);

  // Show first 5 rows with all columns
  console.log('\nFirst 5 rows:');
  for (let rowNum = 1; rowNum <= 5; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let val = cell.value;
      if (typeof val === 'object' && val !== null) {
        val = val.text || val.result || JSON.stringify(val);
      }
      values.push(`[${colNumber}]${val}`);
    });
    console.log(`  Row ${rowNum}: ${values.join(' | ')}`);
  }
}

// Inspect all three files
async function main() {
  await inspectExcel('GRADE 10 ADMISSION ARTS AND SPORTS AS AT 11 JAN 2026.xlsx');
  await inspectExcel('GRADE 10 ADMISSION SOCIAL SCIENCES AS AT 12TH JAN 2026  .xlsx');
  await inspectExcel('GRADE 10 ADMISSION STEM AS AT 12TH JAN 2026  (3).xlsx');
}

main().catch(console.error);
