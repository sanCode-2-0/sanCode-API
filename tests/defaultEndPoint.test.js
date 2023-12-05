import request from "supertest";
import dotenv from "dotenv";
import { db } from "../config/database.js";
import {app} from "../express-app.js";
dotenv.config();


describe("GET defaultResponse",()=>{
    it("should return a status 200",async ()=>{
        const res = request(app).get("/");
        expect(res.statusCode).toBe(200);
    })
})
//Close db connection
afterEach(async ()=>{
    await db.close()
})