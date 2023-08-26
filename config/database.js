import sqlite3 from "sqlite3";
sqlite3.verbose();

//Database variables
const databaseName = "san-code.db";
export const studentTableName = "sanCodeStudent"; //Student records table
export const staffTableName = "sanCodeStaff"; //Staff records table
export const reportTableName = "sanCodeReport"; //Report table

export const db = new sqlite3.Database(`database/${databaseName}`, (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log(`Connected to the database: ${databaseName}`);
  }
});
