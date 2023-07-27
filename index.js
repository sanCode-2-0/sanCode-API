import Express from "express";
import { KEYS } from "./config/keys.js"
const app = Express();

//Main entry point
app.get("/", async (req, res) => {
    //Send a JSON string to validate success
    res.status(200).send({
        status_code: 200,
        message: "Connection successful"
    })
})

app.listen(KEYS.PORT, () => {
    console.log(`Server is listening on port ${KEYS.PORT}`)
})
