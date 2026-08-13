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

module.exports = { listUsers, getUser, deactivateUser };
