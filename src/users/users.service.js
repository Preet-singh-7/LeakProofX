const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');
const { appendAuditLog } = require('../logs/audit.service');

async function listUsers() {
  return User.find().sort({ createdAt: -1 });
}

async function getUser(id) {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  return user;
}

async function deactivateUser(id, actor) {
  const user = await User.findByIdAndUpdate(id, { isActive: false, $inc: { tokenVersion: 1 } }, { new: true });
  if (!user) throw new ApiError(404, 'User not found');

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: 'USER_DEACTIVATED',
    targetType: 'User',
    targetId: id,
    metadata: {},
  });

  return user;
}

/**
 * One-time identity verification: an admin reviews a photo ID and marks the
 * account verified. Not re-checked on every login — this is the "we know
 * who this person is" record that backs the live-selfie accountability
 * evidence captured later at paper-creation/print time (see
 * src/verification/). idProofImage is `select: false` on the schema, so it
 * never comes back from a normal user lookup — only this explicit write
 * and the dedicated fetch in verification.service.js touch it.
 */
async function setIdProof(id, idProofImage, actor) {
  const user = await User.findByIdAndUpdate(
    id,
    {
      idProofImage,
      idVerified: true,
      idVerifiedAt: new Date(),
      idVerifiedBy: actor.id,
    },
    { new: true }
  );
  if (!user) throw new ApiError(404, 'User not found');

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: 'USER_ID_VERIFIED',
    targetType: 'User',
    targetId: id,
    metadata: { verifiedRole: user.role },
  });

  return user;
}

module.exports = { listUsers, getUser, deactivateUser, setIdProof };
