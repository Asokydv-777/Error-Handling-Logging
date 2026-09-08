const express = require("express");
const pino = require("pino");
const { z } = require("zod");

const app = express();
app.use(express.json());

// Logger setup
const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
      },
      "request completed",
    );
  });
  next();
});

// Custom error classes
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
  }
}

class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

class ValidationError extends ApiError {
  constructor(message = "Validation failed") {
    super(400, message);
  }
}

// Zod schema for note validation
const noteSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
});

// Inmemory data store
let notes = [
  { id: 1, title: "First note", content: "This is the first note" },
  { id: 2, title: "Second note", content: "This is the second note" },
];

// GET all notes
app.get("/notes", (req, res) => {
  res.json({ data: notes });
});

// GET a single note by ID
app.get("/notes/:id", (req, res, next) => {
  const note = notes.find((n) => n.id === Number(req.params.id));
  if (!note) {
    return next(new NotFoundError(`Note with id ${req.params.id} not found`));
  }
  res.json({ data: note });
});

// POST create a new note
app.post("/notes", (req, res, next) => {
  try {
    const result = noteSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return next(new ValidationError(`Validation failed: ${errors}`));
    }

    const newNote = {
      id: notes.length + 1,
      ...result.data,
      createdAt: new Date().toISOString(),
    };
    notes.push(newNote);
    res.status(201).json({ data: newNote });
  } catch (error) {
    next(error);
  }
});

// PUT update a note
app.put("/notes/:id", (req, res, next) => {
  try {
    const noteIndex = notes.findIndex((n) => n.id === Number(req.params.id));
    if (noteIndex === -1) {
      return next(new NotFoundError(`Note with id ${req.params.id} not found`));
    }

    const result = noteSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return next(new ValidationError(`Validation failed: ${errors}`));
    }

    notes[noteIndex] = {
      ...notes[noteIndex],
      ...result.data,
      updatedAt: new Date().toISOString(),
    };
    res.json({ data: notes[noteIndex] });
  } catch (error) {
    next(error);
  }
});

// DELETE a note
app.delete("/notes/:id", (req, res, next) => {
  const noteIndex = notes.findIndex((n) => n.id === Number(req.params.id));
  if (noteIndex === -1) {
    return next(new NotFoundError(`Note with id ${req.params.id} not found`));
  }
  notes.splice(noteIndex, 1);
  res.status(204).send();
});

// Centralized error handler
app.use((err, req, res, next) => {
  logger.error(
    {
      method: req.method,
      path: req.path,
      statusCode: err.statusCode || 500,
      error: err.message,
      stack: err.stack,
    },
    "error occurred",
  );

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: {
      message: err.message || "Internal server error",
      code: err.name || "InternalError",
    },
  });
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
