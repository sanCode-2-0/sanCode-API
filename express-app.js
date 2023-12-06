import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import sanCodeBackendRoutes from "./routes/sanCodeBackendRoutes.js";
import { KEYS } from "./config/keys.js";
import path from "path";
import morgan from "morgan";
import moment from "moment-timezone";
import express from "express";
import {errorHandler} from "./middlewear/errorHandler.js";
import {connectToMongoDB} from "./config/mongoDB.js";
import studentRoutes from "./routes/v2/studentRoutes.js";
import staffRoutes from "./routes/v2/staffRoutes.js";

export const app = express();

//Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(errorHandler);
const startOfToday = moment().format("dddd_Do_MMMM_YYYY");
const accessLogStream = fs.createWriteStream(path.join(KEYS.LOG_DIR, `${startOfToday}.log`), { flags: "a" });
app.use(morgan("combined", { stream: accessLogStream }));

//Routes
app.use("/", sanCodeBackendRoutes);
app.use("/v2/student", studentRoutes);
app.use("/v2/staff", staffRoutes);

app.listen(KEYS.PORT, () => {
  const dir = `${KEYS.HOME}/Desktop/sanCode-Excel-Summaries`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.access(dir, fs.constants.W_OK, (err) => {
    if (err) {
      console.error("No write permission");
    }
  });

  //Create logs folder
  const logsFolder = "logs";
  if(!fs.existsSync(logsFolder)){
    fs.mkdirSync(logsFolder,{recursive: true});
  }

  fs.writeFile(`./logs/${startOfToday}.log`, "", (err) => {
    if (err) {
      console.log(err);
    }
  });

  //MongoDB Connection
  connectToMongoDB().then(()=>{
    console.log(`Listening on Port ${KEYS.PORT}`);
  })
});
