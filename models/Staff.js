import { Schema, model } from "mongoose"

const staffSchema = new Schema({
    ailment:{
        type: String,
        required: false,
    },
    complain:{
        type: String,
        required: false,
    },
    fName:{
        type: String,
        required: false,
    },
    idNo:{
        type: Number,
        required: false,
    },
    medication:{
        type: String,
        required: false,
    },
    sName:{
        type: String,
        required: false,
    },
    tempReading:{
        type: Number,
        required: false,
    },
    timeStamp:{
        type: String,
        required: false,
    },
})

export const Staff = model("staff",staffSchema)