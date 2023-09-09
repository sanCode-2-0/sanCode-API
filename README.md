## API Reference

#### Validate that student exists in the database

```http
  GET /students/:admissionNumber
```

| Parameter         | Type     | Description                              |
| :---------------- | :------- | :--------------------------------------- |
| `admissionNumber` | `number` | **Required**. Student's Admission Number |

#### data from the full entry submission

```http
  POST /student-full-entry
```

| Parameter      | Type      | Description                                              |
| :------------- | :-------- | :------------------------------------------------------- |
| `studentAdmNo` | `number`  | **Required**. student's admission number                 |
| `tempReading`  | `decimal` | **Required**. student's temperature reading              |
| `complain`     | `string`  | **Required**. student's complain                         |
| `ailment`      | `string`  | **Required**. ailment that the student is likely to have |
| `medication`   | `string`  | **Required**. medication administered to the student     |

#### Data from the quick update submission

```http
  POST /student-quick-update
```

| Parameter      | Type     | Description                                 |
| :------------- | :------- | :------------------------------------------ |
| `studentAdmNo` | `number` | **Required**. Student's admission number    |
| `tempReading`  | `number` | **Required**. Student's temperature reading |

#### Validate that staff exists in the database

```http
  GET /staff/:idNo
```

| Parameter | Type     | Description                                     |
| :-------- | :------- | :---------------------------------------------- |
| `idNo`    | `number` | **Required**. Staff member's National ID number |

#### Data from the full entry submission for a staff member

```http
  POST /staff-full-entry
```

| Parameter     | Type     | Description                                          |
| :------------ | :------- | :--------------------------------------------------- |
| `idNo`        | `number` | **Required**. Staff member's National ID number      |
| `tempReading` | `number` | **Required**. Staff member's temperature reading     |
| `complain`    | `string` | **Required**. Staff member's complains               |
| `ailment`     | `string` | **Required**. Staff member's ailment                 |
| `medication`  | `string` | **Required**. Staff member's administered medication |

#### Data from the quick update submission for a staff member

```http
  POST /staff-quick-update
```

| Parameter     | Type     | Description                                      |
| :------------ | :------- | :----------------------------------------------- |
| `idNo`        | `number` | **Required**. Staff member's National ID number  |
| `tempReading` | `number` | **Required**. Staff member's temperature reading |

#### Fetch all student data for purposes of the nurse filtering

```http
  GET /student-data
```

#### Fetch all staff data for purposes of the nurse filtering

```http
  GET /staff-data
```

#### Update report data

```http
  GET /update-report
```

#### Generate excel file report

```http
  GET /generate-excel
```

#### Post new student details

```http
  POST /new-students
```

| Parameter                 | Type      | Description                                    |
| :------------------------ | :-------- | :--------------------------------------------- |
| `arrayWithStudentDetails` | `array[]` | **Required**. Array containing student details |

#### Return disease names

```http
  GET /disease
```

#### Return report data

```http
  GET /report
```

New Features-> Restarts after crashing.
-> File hiding to prevent students from tampering with files.
-> Ability to generate Excel summary ( which will be stored on the desktop )

            ( Already available on online version of application )

Future Features -> Editing Individual Student Records. ( Case of Transfers )
-> Deleting records in report.
-> Caching three months worth of records.
-> Sharing of files.
-> Printable report.

> ### Downloading the .log files to my Computer to analyze them

scp root@170.187.252.60:~/sanCode-API/logs/Wednesday_30th_August_2023.log C:/Users/ADMIN/Downloads
