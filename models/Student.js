import { Schema, model } from "mongoose"

const studentSchema = new Schema({
    admNo: {
        type: Number,
        required: true,
    },
    ailment: {
        type: String,
        required: true
    },
    class: {
        type: String,
        required: true
    },
    complain: {
        type: String,
        required: true
    },
    fName: {
        type: String,
        required: false
    },
    fourthName: {
        type: String,
        required: false
    },
    medication: {
        type: String,
        required: false
    },
    sName: {
        type: String,
        required: false,
    },
    tName: {
        type: String,
        required: false,
    },
    tempReading: {
        type: Number,
        required: false,
    },
    timestamp: {
        type: Date,
        required: true,
    },
});

export const Student = model("student",studentSchema);