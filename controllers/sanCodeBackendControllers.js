import { validationResult, check } from "express-validator";
import express, { json } from "express";
const app = express();
import cors from "cors";
import excelJS from "exceljs";
import moment from "moment-timezone";
import pkg from "body-parser";
const { json: _json } = pkg;
import loadData from "../assets/ailmentsChecked.js";
app.use(cors());
app.use(json());
app.use(_json());

// Start of today date
export const startOfToday = moment().startOf("day");
//End of today date
const endOfToday = moment().endOf("day");

import {
  db,
  staffTableName,
  studentTableName,
  reportTableName,
} from "../config/database.js";
import { KEYS } from "../config/keys.js";

//Return name of the API if requested
export const defaultResponse = async (req, res) => {
  res.status(200).send({
    status: 200,
    message: "Make requests to the san-code API",
  });
};
// Import the validation library

//Endpoint to validate that student exists in the database
export const getStudentByAdmissionNumber = async (req, res) => {
  const admissionNumber = Number(req.params.admissionNumber);

  // Validate admissionNumber input
  const validationRules = [
    // Rule to check if admissionNumber is a number
    check("admissionNumber")
      .isNumeric()
      .withMessage("Invalid admission number"),
  ];

  // Validate the input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Select table
  db.get(
    `SELECT * FROM ${studentTableName} WHERE admNo=?`,
    [admissionNumber],
    (err, rows) => {
      if (err) {
        // Log the error to a file
        console.error(err);
        // Send generic response for database disconnection error
        res
          .status(500)
          .json({ error: "An error occurred. Please try again later" });
        return;
      }
      if (!rows || rows.length === 0) {
        res.status(404).json({ error: "Student not found" });
        return;
      }
      res.json(rows);
    }
  );
};

// Endpoint to get students going to the hospital
export const getStudentsGoingToHospital = async (req, res) => {
  db.all(
    `SELECT * FROM ${studentTableName} WHERE going_to_hospital=?`,
    [1],
    (err, rows) => {
      if (err) {
        console.error(err);
        res
          .status(500)
          .json({ error: "An error occurred. Please try again later" });
        return;
      }

      if (!rows || rows.length === 0) {
        res.status(404).json({ error: "No student data" });
        return;
      }

      res.json(rows);
    }
  );
};

// Endpoint to accept data from the full entry submission
export const studentFullEntry = async (req, res) => {
  /*
   * FLOW
   * Check if request body exists and is not null.
   * Destructure the required properties from the request body.
   * Check if any properties are missing in the input data
   * If any required property is missing, send back a 404 status code with an error message.
   * If all required properties are present, update the record in the db using the db.run method.
   * The SQL query updates the record in the studentTableName table with the provided data and the current timestamp.
   * If an error occurs during the update, send a response with a 500 status code and an error message.
   * If the update is successful, send a response with a success message and the current timestamp.
   */
  try {
    if (req?.body !== null && req?.body !== undefined) {
      const {
        studentAdmNo,
        tempReading,
        complain,
        ailment,
        medication,
        going_to_hospital,
      } = req.body;

      //Validate input data
      if (
        !studentAdmNo ||
        !tempReading ||
        !complain ||
        !ailment ||
        !medication ||
        going_to_hospital == undefined
      ) {
        res.status(400).json({ error: "Invalid input data" });
        return;
      }
      // Timestamp
      // const timestamp = moment().tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss");

      // Update record where student admno matches studentAdmNo
      const query = `UPDATE ${studentTableName} SET tempReading=?, complain=?, ailment=?, medication=?, going_to_hospital=?, timestamp=? WHERE admNo=?`;
      const values = [
        tempReading,
        complain,
        ailment,
        medication,
        going_to_hospital ? 1 : 0,
        moment().tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss"),
        studentAdmNo,
      ];
      //Regular function is used instead of arrow function to be able to access `this` within the function
      db.run(query, values, function (error) {
        if (error) {
          // console.error(error.message);
          res
            .status(500)
            .send("An error occurred while processing the request.");
        } else {
          //Should only return if rows are updated
          if (this.changes === 0) {
            res.status(204).send("No rows were updated.");
          } else {
            //Status 200 - Success
            res.status(200).json({
              status: 200,
              message: `Record updated for ${studentAdmNo} successfully. ${new Date()
                .toISOString()
                .replace(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "")} `,
            });
          }
        }
      });
    }
  } catch (error) {
    res.status(400).json({ error: "Invalid request body" });
  }
};

// Endpoint to accept data from the quick update submission
export const studentQuickUpdate = async (req, res) => {
  const { studentAdmNo, tempReading, complain, ailment, going_to_hospital } =
    req.body;

  //Validate input
  if (
    !studentAdmNo ||
    !tempReading ||
    !complain ||
    !ailment ||
    going_to_hospital == undefined
  ) {
    res.status(400).json({ error: "Invalid input data" });
    return;
  }
  // Timestamp
  // const timestamp = moment().tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss");

  // Update record where student admission number matches studentAdmNo
  db.run(
    `UPDATE ${studentTableName} SET tempReading =?, complain =?, ailment=?, going_to_hospital=?, timestamp =? WHERE admNo =? `,
    [
      tempReading,
      complain,
      ailment,
      going_to_hospital ? 1 : 0,
      moment().tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss"),
      studentAdmNo,
    ],
    (error) => {
      if (error) {
        //Log error.message
        res
          .status(500)
          .send({ error: "An error occured while updating the record." });
      } else {
        res.status(200).json({
          status: 200,
          message: `Record updated for ${studentAdmNo} successfully.`,
        });
      }
    }
  );
};

//Endpoint to validate that staff exists in the database
export const getStaffMemberByID = async (req, res) => {
  let idNo = req.params.idNo;

  // Select all from staff table
  db.all(
    `SELECT * FROM ${staffTableName} WHERE idNo = ${idNo} `,
    [],
    (err, rows) => {
      if (err) {
        console.error(err.message);
      }
      res.json(rows);
    }
  );
};

//Endpoint to create a record for a staff member
export const createStaffRecord = async (req, res) => {
  const { idNo, fName, sName } = req.body;

  //Insert a new record for the staff members
  db.run(
    `INSERT INTO ${staffTableName} (idNo, fName, sName) VALUES(?,?,?)`,
    [idNo, fName, sName],
    (error) => {
      if (error) {
        res.status(500).send(`Error creating the entry for ${fName}`);
      } else {
        res.status(200).send({
          status: 200,
          message: "Entry created successfully",
          idNo: idNo,
          fName: fName,
        });
      }
    }
  );
};

// Endpoint to accept data from the full entry submission for a staff member
export const staffFullEntry = async (req, res) => {
  const { idNo, tempReading, complain, ailment, medication } = req.body;

  // Timestamp
  // const timestamp = moment().tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss");

  // Update record where staff Kenyan id No matches idNo
  db.run(
    `UPDATE ${staffTableName} SET tempReading =?, complain =?, ailment =?, medication =?, timestamp =? WHERE idNo =? `,
    [
      tempReading,
      complain,
      ailment,
      medication,
      moment().tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss"),
      idNo,
    ],
    (error) => {
      if (error) {
        res.status(500).send("Error updating the record.");
      } else {
        res
          .status(200)
          .send({ message: `Record updated for ${idNo} successfully.` });
      }
    }
  );
};

// Endpoint to accept data from the quick update submission for a staff member
export const staffQuickUpdate = async (req, res) => {
  const { idNo, tempReading, complain, ailment } = req.body;

  // Timestamp
  // const timestamp = moment().tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss");

  // Update record where staff idNo matches idNo
  db.run(
    `UPDATE ${staffTableName} SET tempReading =?, complain=?, ailment=?, timestamp =? WHERE idNo =? `,
    [
      tempReading,
      complain,
      ailment,
      moment().tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss"),
      idNo,
    ],
    (error) => {
      if (error) {
        res.status(500).send(`Error updating the record.Message : ${error} `);
      } else {
        res
          .status(200)
          .send({ message: `Record updated for ${idNo} successfully.` });
      }
    }
  );
};

// Endpoint to fetch today's student data for purposes of the nurse filtering
export const getStudentData = (req, res) => {
  db.all(
    `SELECT * FROM ${studentTableName} ORDER BY timestamp DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error(err.message);
        res.status(500).send("Internal Server Error");
        return;
      }

      const data = rows.map((row) => {
        const obj = {};
        Object.keys(row).forEach((key) => {
          obj[key] = row[key];
        });
        return obj;
      });

      let filteredData = [];

      // for (let i = 0; i < data.length; i++) {
      //   const dateToBeChecked = moment(
      //     data[i].timestamp,
      //     "YYYY-MM-DD HH:mm:ss"
      //   );
      //   if (dateToBeChecked.isBetween(startOfToday, endOfToday)) {
      //     filteredData.push(data[i]);
      //   }
      // }

      // Filter data for the last 7 days

      for (let i = 0; i < data.length; i++) {
        const dateToBeChecked = moment(
          data[i].timestamp,
          "YYYY-MM-DD HH:mm:ss"
        );

        // Check if is within the last 7 days
        if (dateToBeChecked.isBetween(moment().subtract(7, "days"), moment())) {
          filteredData.push(data[i]);
        }
      }

      res.json(filteredData);
    }
  );
};

// Endpoint to fetch today's staff data for purposes of the nurse filtering
export const getStaffData = (req, res) => {
  db.all(
    `SELECT * FROM ${staffTableName} ORDER BY timestamp DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error(err.message);
        res.status(500).send("Internal Server Error");
        return;
      }

      const data = rows.map((row) => {
        const obj = {};
        Object.keys(row).forEach((key) => {
          obj[key] = row[key];
        });
        return obj;
      });

      let filteredData = [];

      for (let i = 0; i < data.length; i++) {
        const dateToBeChecked = moment(
          data[i].timestamp,
          "YYYY-MM-DD HH:mm:ss"
        );
        // Check if is within the last 7 days
        if (dateToBeChecked.isBetween(moment().subtract(7, "days"), moment())) {
          filteredData.push(data[i]);
        }
      }

      res.json(filteredData);
    }
  );
};

// Endpoint to update report data
export const updateReport = async (req, res) => {
  const resetReportTable = async () => {
    const today = moment().date();
    const lastDayOfMonth = moment().endOf("month").date();
    const batchSQLResetStatements = [];

    for (let day = today; day <= lastDayOfMonth; day++) {
      const sqlResetReportTable = `UPDATE ${reportTableName} SET "${day}" = 0`;
      batchSQLResetStatements.push(sqlResetReportTable);
    }

    // Execute the batch update statements within a transaction
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION;");
        batchSQLResetStatements.forEach((sql) => {
          db.run(sql, (err) => {
            if (err) {
              console.error("SQLITE STATEMENT EXECUTION ERROR: " + err.message);
              db.run("ROLLBACK;", () => {
                reject(err);
              });
            }
          });
        });
        db.run("COMMIT;", (err) => {
          if (err) {
            console.error("BATCH TRANSACTION COMMIT ERROR: " + err.message);
            reject(err);
          } else {
            console.log("Report table reset successfully");
            resolve();
          }
        });
      });
    });
  };

  try {
    const twentyFourHoursAgo = moment()
      .subtract(24, "hours")
      .format("YYYY-MM-DD HH:mm:ss");

    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT staffRecordID AS recordID, idNo AS admNo, fName, sName, NULL AS class, tempReading, complain, ailment, medication, timestamp
        FROM ${staffTableName}
        WHERE timestamp >= ?
        UNION
        SELECT recordID, admNo, fName, sName, class, tempReading, complain, ailment, medication, timestamp
        FROM ${studentTableName}
        WHERE timestamp >= ?`,
        [twentyFourHoursAgo, twentyFourHoursAgo],
        (err, rows) => {
          if (err) {
            console.error(err.message);
            return reject(err);
          }
          resolve(rows);
        }
      );
    });

    const todayAsANumber = moment().date();

    await resetReportTable();

    // Use=ing Promise.all to ensure all updates are completed before responding
    await Promise.all(
      rows.map(async (record) => {
        const { ailment, timestamp } = record;
        const dateToBeChecked = moment(timestamp, "YYYY-MM-DD HH:mm:ss");

        if (dateToBeChecked.isAfter(moment().subtract(24, "hours"))) {
          const sqlUpdateReportTable = `UPDATE ${reportTableName} 
        SET "${todayAsANumber}" = "${todayAsANumber}" + 1
        WHERE disease = "${ailment}"`;

          await new Promise((resolve, reject) => {
            db.run(sqlUpdateReportTable, (err) => {
              if (err) {
                console.error(
                  "SQLITE STATEMENT EXECUTION ERROR: " + err.message
                );
                reject(err);
              } else {
                console.log(`Updated report for ailment ${ailment}`);
                resolve();
              }
            });
          });
        }
      })
    );

    res
      .status(200)
      .json({ status: 200, message: "Successfully updated the report" });
  } catch (error) {
    console.error("UPDATE REPORT ERROR: " + error.message);
    res.status(500).json({ message: "Error updating report" });
  }
};

// Endpoint to generate excel
export const generateExcel = (req, res) => {
  // Select all records from both the students table and staff table
  db.all(
    `SELECT staffRecordID AS recordID, idNo AS regNo, fName, sName, NULL AS tName, NULL AS fourthName, NULL AS class, tempReading, complain, ailment, medication, timestamp
    FROM ${staffTableName}
          UNION
    SELECT recordID, admNo AS regNo, fName, sName, tName, fourthName, class, tempReading, complain, ailment, medication, timestamp
    FROM ${studentTableName} `,
    [],
    async (err, rows) => {
      if (err) {
        console.error(err.message);
      }

      // Transform the rows to objects
      const data = rows.map((row) => {
        const obj = {};
        Object.keys(row).forEach((key) => {
          obj[key] = row[key];
        });
        return obj;
      });

      let filteredData = []; //Just like the data array but holds records whose date matches today's
      let dateToBeChecked;
      // Loop through the data array which holds the records as individual objects.
      for (
        let dataArrayLength = 0;
        dataArrayLength < data.length;
        dataArrayLength++
      ) {
        //Filter and only retrieve records whose timestamp matches to today's
        // Format the date to Moment.js format
        dateToBeChecked = moment(
          data[dataArrayLength].timestamp,
          "YYYY-MM-DD HH:mm:ss"
        );

        // If it falls between start of today and end of the day, spread it into the filteredData array
        // Since it will be handling a lot of data, using the spread operator is kind of effective
        if (dateToBeChecked.isBetween(startOfToday, endOfToday)) {
          filteredData = [...filteredData, data[dataArrayLength]];
        }
      }

      //Logic to insert `filteredData` into an excel file
      let fileName = moment().format("dddd, Do MMMM YYYY");
      fileName = fileName.replace(/ /g, "_").replace(/,/g, "");
      const workbook = new excelJS.Workbook(); // Create a new workbook
      const worksheet = workbook.addWorksheet(fileName);
      const path = `${KEYS.HOME} /Desktop/sanCode - Excel - Summaries`; //Path ( relative to the root folder ) to location where workbook will be saved.
      //Data Column names ( key should match column name in db )
      worksheet.columns = [
        { header: "Record ID", key: "recordID", width: 15 },
        { header: "Admission / ID Number", key: "regNo", width: 15 },
        { header: "First Name", key: "fName", width: 15 },
        { header: "Second Name", key: "sName", width: 15 },
        { header: "Third Name", key: "tName", width: 15 },
        { header: "Fourth Name", key: "fourthName", width: 15 },
        { header: "Student's Class", key: "class", width: 15 },
        { header: "Complain", key: "complain", width: 15 },
        { header: "Temperature Reading", key: "tempReading", width: 15 },
        { header: "Medication", key: "medication", width: 15 },
        { header: "Time Stamp", key: "timestamp", width: 15 },
      ];
      //Loop through data to add data into worksheet
      let counter = 1;
      filteredData.forEach((eachRecord) => {
        eachRecord.recordID = counter;
        worksheet.addRow(eachRecord);
        counter++;
      });

      //Bold the header row ( 1st row ) bold
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { textRotation: 45 };
      });

      //A try catch block to generate excel file
      try {
        const excelData = await workbook.xlsx
          .writeFile(`${path} /${fileName}.xlsx`)
          .then(() => {
            res.download(`${path}/${fileName}.xlsx`, (error) => {
              if (error) {
                res.status(500).json({
                  error: 500,
                  message: "Error generating Excel file!",
                });
              }
            });
          });
      } catch (error) {
        res.send({
          status: "Error",
          message: "Something went wrong...",
        });
      }
    }
  );
};

// Endpoint to post new student details
export const newStudents = async (req, res) => {
  // Binding to hold onto the array with student details
  // Convert string to array
  let arrayWithStudentDetails = req?.body?.body;
  arrayWithStudentDetails = JSON.parse(arrayWithStudentDetails);

  // Example
  // [["First Name","Second Name","Adm No.","Class"],["IBRAHIM","OITAYU","15586","1A"],["MAZURI","ABEL","15596","1A"],["NDEGWA","MICHAEL","15606","1A"],["MWANGI","OSTEEN","15616","1A"],["ODHIAMBO","VICTOR","15626","1A"],["MAX","KAINGU","15636","1A"],["KURIA","ROBERT","15646","1A"],["MWANGI","TAL","15656","1A"],["MUTUA","ELVIS","15666","1A"],["KYALO","STANLEY","15676","1A"],["DENNIS","ABRAHAM","15686","1A"],["MUGUNA","VICTOR","15696","1A"],["ABDULLAHI","HARUN","15706","1A"],["NGALANGE","HOLYFIELD","15716","1A"],["NOAH","MUTIE","15726","1A"],["KIMATHI","TRAVIS","15736","1A"],["RYAN","ODUMA","15746","1A"],

  // Check if the array is empty
  if (!arrayWithStudentDetails) {
    res.status(400).send({
      message: "No student details have been provided",
    });
    return;
  }

  // Check if the array is not an array
  if (!Array.isArray(arrayWithStudentDetails)) {
    console.log(typeof arrayWithStudentDetails);
    res.status(400).send({
      message: "Student details should be an array",
    });
    return;
  }

  // Check if the array is empty
  if (arrayWithStudentDetails.length === 0) {
    res.status(400).send({
      message: "No student details have been provided",
    });
    return;
  }

  // Check if the array has the correct number of columns
  if (arrayWithStudentDetails[0].length !== 4) {
    res.status(400).send({
      message: "Invalid number of columns in the student details",
    });
    return;
  }

  // Check if the array has the correct column names
  if (
    arrayWithStudentDetails[0][0] !== "First Name" ||
    arrayWithStudentDetails[0][1] !== "Second Name" ||
    arrayWithStudentDetails[0][2] !== "Adm No." ||
    arrayWithStudentDetails[0][3] !== "Class"
  ) {
    res.status(400).send({
      message: "Invalid column names in the student details",
    });
    return;
  }

  // Insert prepared statement
  const insertQuery = `INSERT INTO ${studentTableName} (admNo, fName, sName, class) VALUES(?,?,?,?)`;
  const selectQuery = `SELECT COUNT(*) as count FROM ${studentTableName} WHERE admNo=?`;

  // Loop through the array and insert the records
  for (let i = 1; i < arrayWithStudentDetails.length; i++) {
    const studentDetails = arrayWithStudentDetails[i];
    const admNo = studentDetails[2];
    const fName = studentDetails[0];
    const sName = studentDetails[1];
    const studentClass = studentDetails[3];

    // Check if the student exists
    const count = await new Promise((resolve, reject) => {
      db.get(selectQuery, [admNo], (err, row) => {
        if (err) {
          console.error(err.message);
          reject(err);
        }
        resolve(row.count);
      });
    });

    // If the student does not exist, insert the student
    if (count === 0) {
      db.run(insertQuery, [admNo, fName, sName, studentClass], (err) => {
        if (err) {
          console.error(err.message);
        }
      });
    }
  }

  res.status(200).send({
    message: "Student details have been successfully added",
  });
};

// Endpoint to get disease names
export const getDiseaseNames = (req, res) => {
  db.all(`SELECT disease FROM ${reportTableName}`, [], (err, rows) => {
    if (err) {
      console.error(err.message);
    }

    const data = rows.map((row) => {
      const obj = {};
      Object.keys(row).forEach((key) => {
        obj[key] = row[key];
      });
      return obj;
    });
    res.status(200).json(data);
  });
};

// Endpoint to return report data
export const getReportData = (req, res) => {
  // Select table
  db.all(`SELECT * FROM ${reportTableName}`, [], (err, rows) => {
    if (err) {
      console.error(err.message);
    }

    // Transform the rows to objects
    const data = rows.map((row) => {
      const obj = {};
      Object.keys(row).forEach((key) => {
        obj[key] = row[key];
      });
      return obj;
    });
    res.status(200).json(data);
  });
};

//Endpoint to return data for the analytics page
// Endpoint to return report data with pagination
export const getReportAnalytics = (req, res) => {
  const page = req.query.page || 1; // Get the page number from the request query, default to 1
  const pageSize = 10; // Number of records to return per page

  // Calculate the offset based on the page number and page size
  const offset = (page - 1) * pageSize;

  // Select table with pagination
  db.all(
    `SELECT * FROM ${reportTableName} LIMIT ? OFFSET ?`,
    [pageSize, offset],
    (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: "Internal server error" });
      }

      // Transform the rows to objects
      const data = rows.map((row) => {
        const obj = {};
        Object.keys(row).forEach((key) => {
          obj[key] = row[key];
        });
        return obj;
      });

      res.json(data);
    }
  );
};
