const mongoose = require('mongoose');
const { QUESTION_DIFFICULTY_VALUES } = require('../config/constants');

// The pool that randomized paper generation draws from (see
// src/papers/generation.service.js). Deliberately its own collection rather
// than embedded in Paper — the same question is meant to be reused across
// many generated variants, and the bank needs to be manageable (add/edit/
// delete) independently of any specific exam.
const questionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, index: true },
    topic: { type: String, trim: true, default: '' },
    difficulty: { type: String, enum: QUESTION_DIFFICULTY_VALUES, required: true },
    marks: { type: Number, required: true, min: 1 },
    text: { type: String, required: true, trim: true },
    // Non-empty => MCQ; empty => subjective/descriptive question.
    options: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Question', questionSchema);
