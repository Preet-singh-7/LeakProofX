const questionsService = require('./questions.service');
const asyncHandler = require('../middleware/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const question = await questionsService.createQuestion(req.body, req.user);
  res.status(201).json({ question });
});

const list = asyncHandler(async (req, res) => {
  const questions = await questionsService.listQuestions(req.query);
  res.status(200).json({ questions });
});

const getOne = asyncHandler(async (req, res) => {
  const question = await questionsService.getQuestionById(req.params.id);
  res.status(200).json({ question });
});

const update = asyncHandler(async (req, res) => {
  const question = await questionsService.updateQuestion(req.params.id, req.body, req.user);
  res.status(200).json({ question });
});

const remove = asyncHandler(async (req, res) => {
  await questionsService.deleteQuestion(req.params.id, req.user);
  res.status(204).send();
});

module.exports = { create, list, getOne, update, remove };
