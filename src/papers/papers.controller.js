const papersService = require('./papers.service');
const asyncHandler = require('../middleware/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const paper = await papersService.createPaper(req.body, req.user);
  res.status(201).json({ paper });
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

module.exports = { create, list, getOne, getQr, decrypt, print };
