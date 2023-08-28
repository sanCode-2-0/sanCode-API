import express, { json } from "express";
import cors from "cors";
import fs from "fs";
import pkg from "body-parser";
import sanCodeBackendRoutes from "./routes/sanCodeBackendRoutes.js";
import { KEYS } from "./config/keys.js";
const app = express();
const { json: _json } = pkg;
// Array holding ailments checked
app.use(cors());
app.use(json());
app.use(_json());

app.use("/", sanCodeBackendRoutes);

// Start the server
app.listen(KEYS.PORT, () => {
  //Create "workbooks" directory if it doesn't exist
  const dir = `${KEYS.HOME}/Desktop/sanCode-Excel-Summaries`;

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  //Check if I have write permissions
  // Check if you have write permissions
  fs.access(dir, fs.constants.W_OK, (err) => {
    if (err) {
      console.error("No write permission");
    } else {
      console.log("You have write permission");
    }
  });

  console.log(`Server is listening on port ${KEYS.PORT}`);
});
