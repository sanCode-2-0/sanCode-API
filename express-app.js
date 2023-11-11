import express, { json } from "express";
import cors from "cors";
import fs from "fs";
import pkg from "body-parser";
import sanCodeBackendRoutes from "./routes/sanCodeBackendRoutes.js";
import { KEYS } from "./config/keys.js";
import path from "path";
import morgan from "morgan";
import moment from "moment-timezone";
const app = express();
const { json: _json } = pkg;
// Array holding ailments checked
app.use(cors());
app.use(json());
app.use(_json());

//Logging server activities
let startOfToday = moment()
  .format("dddd, Do MMMM YYYY")
  .replace(/ /g, "_")
  .replace(/,/g, "");
// create a write stream (in append mode)
var accessLogStream = fs.createWriteStream(
  path.join(KEYS.LOG_DIR, `${startOfToday}.log`),
  {
    flags: "a",
  }
);
// setup the logger
app.use(morgan("combined", { stream: accessLogStream }));


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
    }
  });

  //Create today's log file if doesn't exist
  fs.writeFile(`./logs/${startOfToday}.log`, "", (err) => {
    if (err) {
      console.log(err);
    }
  });

  connectDB().then(() => {
    console.log(`Listening  on Port ${KEYS.PORT}`);
  });
});
