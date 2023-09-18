import { Schema, model } from "mongoose";

const taskSchema = new Schema({
  completed: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
});

const Task = model("Task", taskSchema);

export default Task;
