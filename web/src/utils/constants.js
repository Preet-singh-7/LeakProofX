// Mirrors src/config/constants.js on the backend. Duplicated rather than
// shared across a package boundary since frontend and backend are separate
// deployable units in this repo — see Phase 3 docs for that trade-off.
export const ROLES = {
  ADMIN: 'ADMIN',
  BOARD: 'BOARD',
  COURIER: 'COURIER',
  CENTER: 'CENTER',
  INVIGILATOR: 'INVIGILATOR',
  AUDITOR: 'AUDITOR',
};

export const ROLE_VALUES = Object.values(ROLES);

export const CUSTODY_STEP_ORDER = [
  'CREATED',
  'HANDOVER_TO_COURIER',
  'ARRIVED_AT_CENTER',
  'STORED_IN_VAULT',
  'HANDOVER_TO_EXAM_HALL',
  'OPENED_FOR_EXAM',
  'COMPLETED',
];

export const ALERT_STATUS_VALUES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
export const ALERT_SEVERITY_VALUES = ['WARNING', 'CRITICAL'];
