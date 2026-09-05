const { Router } = require('express');
const controller = require('./questions.controller');
const { validate, jsonBodyParser } = require('../security/input-validation');
const { questionBankLimiter } = require('../security/rate-limit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const {
  questionIdParamSchema,
  createQuestionSchema,
  updateQuestionSchema,
  listQuestionsQuerySchema,
} = require('./questions.validation');

const router = Router();

// The question bank is the raw material randomized generation draws
// exam content from — as sensitive as paper content itself, so it's gated
// to the same roles that can create papers (BOARD/ADMIN), not opened up to
// every authenticated role the way papers' GET / is.
router.use(jsonBodyParser({ limit: '10kb' }));
router.use(questionBankLimiter);
router.use(requireAuth, requireRole([ROLES.BOARD, ROLES.ADMIN]));

router.post('/', validate(createQuestionSchema), controller.create);
router.get('/', validate(listQuestionsQuerySchema, 'query'), controller.list);
router.get('/:id', validate(questionIdParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id',
  validate(questionIdParamSchema, 'params'),
  validate(updateQuestionSchema),
  controller.update
);
router.delete('/:id', validate(questionIdParamSchema, 'params'), controller.remove);

module.exports = router;
