const ExcelJS = require('exceljs');
const path = require('path');

async function verifyA1() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../temp_data', 'GRADE 10 ADMISSION ARTS AND SPORTS AS AT 11 JAN 2026.xlsx');

  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  console.log('=== A1 Students from Excel ===\n');
  console.log('School No | Name | Class | House | Subject Combination');
  console.log('-'.repeat(100));

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 2) return; // Skip header

    const schoolNo = row.getCell(2).value;
    const name = row.getCell(4).value;
    const studentClass = row.getCell(6).value;
    const house = row.getCell(7).value;
    const subjects = row.getCell(8).value;

    if (studentClass === 'A1') {
      console.log(`${schoolNo} | ${name} | ${studentClass} | ${house} | ${subjects}`);
    }
  });
}

verifyA1().catch(console.error);
