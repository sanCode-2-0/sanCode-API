import request from "supertest"
import {app} from "../../../express-app.js";
const testIDNumber = 21772421;

describe("Test GET /staff/:idNo", ()=>{
    //Status 200 - Success
    test("Status 200 - Success",async ()=>{
        const response = await request(app)
            .get(`/staff/${testIDNumber}`)
            .expect(200)
    })

    //Properties of response body
    // {
    //     idNo: 21772421,
    //     fName: 'Mildred',
    //     sName: 'Mulima',
    //     tempReading: 37.9,
    //     complain: 'bee sting',
    //     ailment: 'other bites',
    //     medication: 'cet, hydrocort inj,',
    //     timestamp: '2023-09-10 14:12:16'
    // }
    test("Properties of response body",async ()=>{
        const response = await request(app)
            .get(`/staff/${testIDNumber}`)

        //Store received body in array and access the first record
        const bodyData = response._body[0];
        expect(bodyData).toHaveProperty('staffRecordID')
        expect(bodyData).toHaveProperty('idNo')
        expect(bodyData).toHaveProperty('fName')
        expect(bodyData).toHaveProperty('sName')
        expect(bodyData).toHaveProperty('tempReading')
        expect(bodyData).toHaveProperty('complain')
        expect(bodyData).toHaveProperty('ailment')
        expect(bodyData).toHaveProperty('medication')
        expect(bodyData).toHaveProperty('timestamp')
    })
})

describe("Test POST /staff-full-entry",()=>{
    const testPostData = {
        idNo : testIDNumber,
        tempReading : 36.6,
        complain: "Fever",
        ailment: "Fevers",
        medication: "PCM"
    }
    //Status 204 - Updated with no return meaningful data
    test("Successfully update the data in the database",async()=>{
        const response = await request(app)
            .post("/staff-full-entry")
            .send(testPostData)
            .expect(200)
    })

    //Status code and message returned
    test("Status code and message returned",async ()=>{
        const response = await request(app)
            .post("/staff-full-entry")
            .send(testPostData)
            .expect(200)
        expect(response._body).toHaveProperty('message')
    })
})

describe("Test POST /staff-quick-update",()=>{
    const testPostData = {
        idNo: testIDNumber,
        tempReading: 36.7
    }

    //Status 204 - Updated with no meaningful return data
    test("Test status code returned ( 200 )",async()=>{
        await request(app)
            .post("/staff-quick-update")
            .send(testPostData)
            .expect(200)
    })

    //Status code and message returned
    test("Test json data returned ( {message} )",async()=>{
        const response = await request(app)
            .post("/staff-quick-update")
            .send(testPostData)
            .expect(200)
        expect(response._body).toHaveProperty('message')
    })
})

describe("Test GET /staff-data",()=>{

    //Status 200 - Successful
    test("Status 200 - Successful",async()=>{
        await request(app)
            .get("/staff-data")
            .expect(200)
    })

    //Properties in the received JSON
    // {
    //     idNo: 21772421,
    //     fName: 'Mildred',
    //     sName: 'Mulima',
    //     tempReading: 37.9,
    //     complain: 'bee sting',
    //     ailment: 'other bites',
    //     medication: 'cet, hydrocort inj,',
    //     timestamp: '2023-09-10 14:12:16'
    // }
    test("Properties in the received JSON",async ()=>{
        const response = await request(app)
            .get("/staff-data")
            .expect(200)

        const bodyData = response._body;
        const responseBodyLength = response._body.length;
        for(let counter = 0; counter < responseBodyLength; counter++){
            expect(bodyData[counter]).toHaveProperty('staffRecordID')
            expect(bodyData[counter]).toHaveProperty('idNo')
            expect(bodyData[counter]).toHaveProperty('fName')
            expect(bodyData[counter]).toHaveProperty('sName')
            expect(bodyData[counter]).toHaveProperty('tempReading')
            expect(bodyData[counter]).toHaveProperty('complain')
            expect(bodyData[counter]).toHaveProperty('ailment')
            expect(bodyData[counter]).toHaveProperty('medication')
            expect(bodyData[counter]).toHaveProperty('timestamp')

        }
    })
})