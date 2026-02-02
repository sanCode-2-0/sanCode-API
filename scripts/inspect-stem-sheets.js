const ExcelJS = require('exceljs');
const path = require('path');

async function inspectStemSheets() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../temp_data', 'GRADE 10 ADMISSION STEM AS AT 12TH JAN 2026  (3).xlsx');

  await workbook.xlsx.readFile(filePath);

  console.log('=== STEM Excel Worksheets ===\n');
  console.log(`Total worksheets: ${workbook.worksheets.length}\n`);

  workbook.worksheets.forEach((ws, index) => {
    console.log(`\n--- Sheet ${index + 1}: "${ws.name}" ---`);
    console.log(`Rows: ${ws.rowCount}, Columns: ${ws.columnCount}`);

    // Show first 3 rows
    for (let rowNum = 1; rowNum <= Math.min(4, ws.rowCount); rowNum++) {
      const row = ws.getRow(rowNum);
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 8) {
          let val = cell.value;
          if (typeof val === 'object' && val !== null) {
            val = val.text || val.result || JSON.stringify(val);
          }
          values.push(`[${colNumber}]${String(val).substring(0, 20)}`);
        }
      });
      console.log(`  Row ${rowNum}: ${values.join(' | ')}`);
    }
  });
}

inspectStemSheets().catch(console.error);
