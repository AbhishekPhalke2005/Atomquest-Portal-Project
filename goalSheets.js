import express from 'express';
import {
  getGoalSheets,
  getGoalSheet,
  saveGoalSheet,
  submitGoalSheet,
  approveGoalSheet,
  returnForRework,
  pushSharedGoal,
  updateSharedGoalWeightage,
  requestUnlock,
  resolveUnlockRequest,
  exportGoalSheets,
  getGoalSheetStats,
} from '../controllers/goalSheetController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require login
router.use(protect);

// ── Stats & export ─────────────────────────────────────────────────────
router.get('/stats', getGoalSheetStats);
router.get('/export', authorize('admin', 'manager'), exportGoalSheets);

// ── Shared goal push ───────────────────────────────────────────────────
router.post('/shared-goal', authorize('admin', 'manager'), pushSharedGoal);

// ── Main CRUD ──────────────────────────────────────────────────────────
router.route('/')
  .get(getGoalSheets)
  .post(authorize('employee'), saveGoalSheet);

router.get('/:id', getGoalSheet);

// ── Workflow actions ───────────────────────────────────────────────────
router.post('/:id/submit',  authorize('employee'),           submitGoalSheet);
router.post('/:id/approve', authorize('manager', 'admin'),   approveGoalSheet);
router.post('/:id/rework',  authorize('manager', 'admin'),   returnForRework);

// ── Shared goal weightage update ───────────────────────────────────────
router.patch('/:sheetId/goals/:goalId/weightage', authorize('employee'), updateSharedGoalWeightage);

// ── Unlock requests ────────────────────────────────────────────────────
router.post('/:id/unlock-request',                       authorize('employee'), requestUnlock);
router.patch('/:id/unlock-request/:requestId',           authorize('admin'),    resolveUnlockRequest);

export default router;
