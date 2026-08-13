// One-time bootstrap: creates the first ADMIN user directly against the DB,
// bypassing the API's ADMIN-gated /auth/register endpoint (there is
// deliberately no open self-signup surface — see src/auth/auth.routes.js).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { env } = require('../src/config/env');
const User = require('../src/models/User');
const { ROLES } = require('../src/config/constants');
const { appendAuditLog } = require('../src/logs/audit.service');

async function main() {
  await mongoose.connect(env.mongoUri);

  const existing = await User.findOne({ email: env.seedAdmin.email });
  if (existing) {
    console.log(`Admin user ${env.seedAdmin.email} already exists. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(env.seedAdmin.password, 12);
  const admin = await User.create({
    name: env.seedAdmin.name,
    email: env.seedAdmin.email,
    passwordHash,
    role: ROLES.ADMIN,
  });

  await appendAuditLog({
    actorUserId: admin._id,
    actorRoleId: ROLES.ADMIN,
    action: 'ADMIN_SEEDED',
    targetType: 'User',
    targetId: String(admin._id),
    metadata: { email: admin.email },
  });

  console.log(`Seeded admin user: ${admin.email}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed to seed admin:', err);
  process.exit(1);
});
