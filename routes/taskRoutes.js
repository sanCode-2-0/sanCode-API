import { Router } from "express";
import Task from "../models/Task.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const tasks = await Task.find();
    res.json({ tasks });
  } catch (error) {
    console.error(error);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findById(id);
    res.json({ task });
  } catch (error) {
    console.error(error);
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { completed, title } = req.body;
    const updateTask = {};

    if (completed !== undefined) updateTask.completed = completed;
    if (title) updateTask.title = title;

    const task = await Task.findByIdAndUpdate(id, updateTask, {
      new: true,
    });

    res.json({ task });
  } catch (error) {
    console.error(error);
  }
});

router.post("/", async (req, res) => {
  try {
    const { completed, title } = req.body;
    const task = await Task.create({
      completed,
      title,
    });
    res.json({ task });
  } catch (error) {
    console.error(error);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findByIdAndDelete(id);
    res.json({ task });
  } catch (error) {
    console.error(error);
  }
});

export default router;
