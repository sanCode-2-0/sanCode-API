import request from "supertest";
import { app } from "../../../express-app.js";
const testAdmissionNumber = 13256;

describe("Test GET /students/:admissionNumber", () => {
  //Status 200 - Success
  test("Status 200 - Success", async () => {
    const response = await request(app)
      .get(`/students/${testAdmissionNumber}`)
      .expect(200);
  });

  //Properties of response body
  // {
  //     recordID: 1082,
  //         admNo: 13256,
  //     fName: 'BRIANE',
  //     sName: 'LOMONI',
  //     class: '5D',
  //     tempReading: 35.8,
  //     complain: 'Fever',
  //     ailment: 'Fevers',
  //     medication: 'PCM',
  //     timestamp: '2023-11-15T17:48:18.254Z',
  //     tName: null,
  //     fourthName: null
  // }
  test("Properties of response body", async () => {
    const response = await request(app).get(`/students/${testAdmissionNumber}`);
    expect(response._body).toHaveProperty("recordID");
    expect(response._body).toHaveProperty("admNo");
    expect(response._body).toHaveProperty("fName");
    expect(response._body).toHaveProperty("sName");
    expect(response._body).toHaveProperty("class");
    expect(response._body).toHaveProperty("tempReading");
    expect(response._body).toHaveProperty("complain");
    expect(response._body).toHaveProperty("ailment");
    expect(response._body).toHaveProperty("medication");
    expect(response._body).toHaveProperty("timestamp");
    expect(response._body).toHaveProperty("tName");
    expect(response._body).toHaveProperty("fourthName");
  });
});

describe("Test GET /students-going-to-hospital", () => {
  //Status 200 - Success
  test("Status 200 - Success", async () => {
    await request(app).get("/students-going-to-hospital").expect(200);
  });

  //Properties of response body
  // [{
  //     recordID: 1082,
  //         admNo: 13256,
  //     fName: 'BRIANE',
  //     sName: 'LOMONI',
  //     class: '5D',

  //     tempReading: 35.8,
  //     complain: 'Fever',
  //     ailment: 'Fevers',
  //     medication: 'PCM',
  //     timestamp: '2023-11-15T17:48:18.254Z',
  //     tName: null,
  //     fourthName: null
  // }]
  test("Properties of response body", async () => {
    const response = await request(app).get("/students-going-to-hospital");
    const responseBody = response._body;
    for (let counter = 0; counter < responseBody.length; counter++) {
      expect(responseBody[counter]).toHaveProperty("recordID");
      expect(responseBody[counter]).toHaveProperty("admNo");
      expect(responseBody[counter]).toHaveProperty("fName");
      expect(responseBody[counter]).toHaveProperty("sName");
      expect(responseBody[counter]).toHaveProperty("class");
      expect(responseBody[counter]).toHaveProperty("tempReading");
      expect(responseBody[counter]).toHaveProperty("complain");
      expect(responseBody[counter]).toHaveProperty("ailment");
      expect(responseBody[counter]).toHaveProperty("medication");
      expect(responseBody[counter]).toHaveProperty("timestamp");
      expect(responseBody[counter]).toHaveProperty("tName");
      expect(responseBody[counter]).toHaveProperty("fourthName");
    }
  });
});

describe("Test POST /student-full-entry", () => {
  const testPostData = {
    studentAdmNo: testAdmissionNumber,
    tempReading: 45.8,
    complain: "Fever",
    ailment: "Fevers",
    medication: "gfddddddde",
    going_to_hospital: 1,
  };
  //Status 204 - Updated with no return meaningful data
  test("Successfully update the data in the database", async () => {
    const response = await request(app)
      .post("/student-full-entry")
      .send(testPostData)
      .expect(200);
  });

  //Status code and message returned
  test("Status code and message returned", async () => {
    const response = await request(app)
      .post("/student-full-entry")
      .send(testPostData)
      .expect(200);

    expect(response._body).toHaveProperty("status");
    expect(response._body).toHaveProperty("message");
  });
});

describe("Test POST /student-quick-update", () => {
  const testPostData = {
    studentAdmNo: testAdmissionNumber,
    tempReading: 36.7,
    complain: "head",
    medication: "pcm",
    going_to_hospital: 1,
  };

  //Status 204 - Updated with no meaningful return data
  test("Test status code returned ( 200 )", async () => {
    await request(app)
      .post("/student-quick-update")
      .send(testPostData)
      .expect(200);
  });

  //Status code and message returned
  test("Test json data returned ( {status,message} )", async () => {
    const response = await request(app)
      .post("/student-quick-update")
      .send(testPostData)
      .expect(200);
    expect(response._body).toHaveProperty("status");
    expect(response._body).toHaveProperty("message");
  });
});

describe("Test POST /student-create-entry",() =>{
  const testPostData = {
    admNo: 12111,
    fName: "fName",
    sName: "sName",
    class: "2K",
  }

  //Status 204 - Updated with no meaningful return data
  test("Test status code returned ( 200 )", async () => {
    await request(app)
      .post("/student-create-entry")
      .send(testPostData)
      .expect(200);
  });

  //Status code and message returned
  test("Test json data returned ( {status,message} )", async () => {
    const response = await request(app)
      .post("/student-create-entry")
      .send(testPostData)
      .expect(200);
    expect(response._body).toHaveProperty("status");
    expect(response._body).toHaveProperty("message");
  });
})

describe("Test GET /student-data", () => {
  //Status 200 - Successful
  test("Status 200 - Successful", async () => {
    await request(app).get("/student-data").expect(200);
  });

  //Properties in the received JSON
  // {
  //     recordID: 1082,
  //         admNo: 13256,
  //     fName: 'BRIANE',
  //     sName: 'LOMONI',
  //     class: '5D',
  //     tempReading: 36.7,
  //     complain: 'Fever',
  //     ailment: 'Fevers',
  //     medication: 'PCM',
  //     timestamp: '2023-12-20T13:05:13.515Z',
  //     tName: null,
  //     fourthName: null
  // }
  test("Properties in the received JSON", async () => {
    const response = await request(app).get("/student-data").expect(200);

    const responseBody = response._body;
    const responseBodyLength = response._body.length;
    for (let counter = 0; counter < responseBodyLength; counter++) {
      expect(responseBody[counter]).toHaveProperty("recordID");
      expect(responseBody[counter]).toHaveProperty("admNo");
      expect(responseBody[counter]).toHaveProperty("fName");
      expect(responseBody[counter]).toHaveProperty("sName");
      expect(responseBody[counter]).toHaveProperty("class");
      expect(responseBody[counter]).toHaveProperty("tempReading");
      expect(responseBody[counter]).toHaveProperty("complain");
      expect(responseBody[counter]).toHaveProperty("ailment");
      expect(responseBody[counter]).toHaveProperty("medication");
      expect(responseBody[counter]).toHaveProperty("timestamp");
      expect(responseBody[counter]).toHaveProperty("tName");
      expect(responseBody[counter]).toHaveProperty("fourthName");
    }
  });
});

describe("Test GET /update-report", () => {
  //Properties of response body
  // {
  //     message: "Successfully updated the report"
  // }
  test("Properties of response body", async () => {
    const response = await request(app).get("/update-report");

    const responseBody = response._body;
    expect(responseBody).toHaveProperty("message");
  });
});

describe("Test GET /generate-excel", () => {
  test("Status", async () => {
    const response = await request(app).get("/generate-excel");

    console.log(response._body);
  });
});

describe("Test GET /disease", () => {
  test("Status 200 - Successful", async () => {
    await request(app).get("/disease").expect(200);
  });

  //Properties of body
  //{disease:""}
  test("Properties of body", async () => {
    const response = await request(app).get("/disease");

    const responseBody = response._body;
    for (let counter = 0; counter < responseBody.length; counter++) {
      expect(responseBody[counter]).toHaveProperty("disease");
    }
  });
});

describe("Test GET /report", () => {
  //Status 200 - Successful
  test("Status 200 - Successful", async () => {
    await request(app).get("/report").expect(200);
  });
});
