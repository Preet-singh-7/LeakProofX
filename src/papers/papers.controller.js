const papersService = require('./papers.service');
const { generatePaperVariants } = require('./generation.service');
const asyncHandler = require('../middleware/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const paper = await papersService.createPaper(req.body, req.user);
  res.status(201).json({ paper });
});

const generate = asyncHandler(async (req, res) => {
  const papers = await generatePaperVariants(req.body, req.user);
  res.status(201).json({ papers });
});

const list = asyncHandler(async (req, res) => {
  const papers = await papersService.listPapers(req.user);
  res.status(200).json({ papers });
});

const getOne = asyncHandler(async (req, res) => {
  const paper = await papersService.getPaperById(req.params.id);
  res.status(200).json({ paper });
});

const getQr = asyncHandler(async (req, res) => {
  const qr = await papersService.getQrImage(req.params.id);
  res.status(200).json(qr);
});

const decrypt = asyncHandler(async (req, res) => {
  const result = await papersService.accessPaperContent(req.params.id, req.user, {
    action: 'PAPER_DECRYPTED',
    location: req.body?.location,
    deviceId: req.body?.deviceId,
    selfieImage: req.body?.selfieImage,
  });
  res.status(200).json(result);
});

const print = asyncHandler(async (req, res) => {
  const result = await papersService.accessPaperContent(req.params.id, req.user, {
    action: 'PAPER_PRINTED',
    location: req.body?.location,
    deviceId: req.body?.deviceId,
    selfieImage: req.body?.selfieImage,
  });
  res.status(200).json(result);
});

const getComposition = asyncHandler(async (req, res) => {
  const composition = await papersService.getPaperComposition(req.params.id, req.user);
  res.status(200).json(composition);
});

module.exports = { create, generate, list, getOne, getQr, decrypt, print, getComposition };
