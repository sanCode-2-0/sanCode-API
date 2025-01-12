const sqlite3 = require("sqlite3");

sqlite3.verbose();

// Database variables
const databaseName = "san-code.sqlite";
const studentTableName = "sanCodeStudent"; // Student records table
const staffTableName = "sanCodeStaff"; // Staff records table
const reportTableName = "sanCodeReport"; // Report table

const db = new sqlite3.Database(`database/${databaseName}`, (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log(`Connected to the database: ${databaseName}`);
  }
});

module.exports = {
  db,
  studentTableName,
  staffTableName,
  reportTableName,
};
