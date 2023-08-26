export const getStudentByAdmissionNumber = async (req, res) => {
  const admissionNumber = req.params.admissionNumber;

  // Select table
  db.all(
    `SELECT * FROM ${studentTableName} WHERE admNo=${admissionNumber}`,
    [],
    (err, rows) => {
      if (err) {
        console.error(err.message);
      }
      res.json(rows);
    }
  );
};
