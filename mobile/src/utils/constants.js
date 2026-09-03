// Mirrors src/config/constants.js on the backend (same duplication
// trade-off already made in web/src/utils/constants.js — see Phase 3 docs).
export const ROLES = {
  ADMIN: 'ADMIN',
  BOARD: 'BOARD',
  COURIER: 'COURIER',
  CENTER: 'CENTER',
  INVIGILATOR: 'INVIGILATOR',
  AUDITOR: 'AUDITOR',
};

export const CUSTODY_STEP_ORDER = [
  'CREATED',
  'HANDOVER_TO_COURIER',
  'ARRIVED_AT_CENTER',
  'STORED_IN_VAULT',
  'HANDOVER_TO_EXAM_HALL',
  'OPENED_FOR_EXAM',
  'COMPLETED',
];

// Roles the backend's POST /tracking/scan allows at all (custody.js narrows
// further per exact step pair — this is just who should see the scan screen).
export const SCAN_ROLES = [ROLES.COURIER, ROLES.CENTER, ROLES.INVIGILATOR, ROLES.BOARD, ROLES.ADMIN];

// Mirrors papers.routes.js's requireRole on POST /papers/:id/print.
export const PRINT_ROLES = [ROLES.INVIGILATOR, ROLES.ADMIN];
