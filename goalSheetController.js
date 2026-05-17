import GoalSheet from '../models/GoalSheet.js';
import { Cycle, AuditLog, Notification } from '../models/index.js';
import User from '../models/User.js';
import { asyncHandler, AppError } from '../middleware/error.js';

// ─── Helper: get active cycle ─────────────────────────────────────────────
async function getActiveCycle() {
  const cycle = await Cycle.findOne({ isActive: true }).sort({ startDate: -1 });
  if (!cycle) throw new AppError('No active goal-setting cycle found. Please contact HR Admin.', 400);
  return cycle;
}

// ─── Helper: audit log ───────────────────────────────────────────────────
async function audit(userId, action, entityId, changes, req) {
  await AuditLog.create({
    user: userId,
    action,
    entity: 'GoalSheet',
    entityId: entityId.toString(),
    changes,
    ipAddress: req?.ip,
    userAgent: req?.get?.('user-agent'),
  });
}

// ─── Helper: notify ──────────────────────────────────────────────────────
async function notify(userId, type, title, message, link) {
  await Notification.create({ user: userId, type, title, message, link,
    relatedEntity: { entityType: 'GoalSheet', entityId: userId } });
}

// ─────────────────────────────────────────────────────────────────────────
// @desc   Get my goal sheet (employee) or team sheets (manager) or all (admin)
// @route  GET /api/goalsheets
// @access Private
export const getGoalSheets = asyncHandler(async (req, res) => {
  const { role, id } = req.user;
  let filter = {};

  if (role === 'employee') {
    filter.employee = id;
  } else if (role === 'manager') {
    const teamMembers = await User.find({ manager: id }).select('_id');
    const ids = teamMembers.map(u => u._id);
    filter.employee = { $in: ids };
  }
  // admin → no filter, sees all

  const sheets = await GoalSheet.find(filter)
    .populate('employee', 'firstName lastName email department position avatar')
    .populate('cycle', 'name startDate endDate fiscalYear quarter')
    .populate('approvedBy', 'firstName lastName email')
    .populate('goals.sharedBy', 'firstName lastName')
    .sort({ updatedAt: -1 });

  res.json({ success: true, count: sheets.length, data: sheets });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Get single goal sheet by ID
// @route  GET /api/goalsheets/:id
// @access Private
export const getGoalSheet = asyncHandler(async (req, res, next) => {
  const sheet = await GoalSheet.findById(req.params.id)
    .populate('employee', 'firstName lastName email department position avatar')
    .populate('cycle', 'name startDate endDate fiscalYear quarter')
    .populate('approvedBy', 'firstName lastName email')
    .populate('unlockRequests.requestedBy', 'firstName lastName')
    .populate('unlockRequests.resolvedBy', 'firstName lastName');

  if (!sheet) return next(new AppError('Goal sheet not found', 404));

  // Access control
  const { role, id } = req.user;
  const empId = sheet.employee._id.toString();

  if (role === 'employee' && empId !== id) {
    return next(new AppError('Not authorised to view this goal sheet', 403));
  }
  if (role === 'manager') {
    const emp = await User.findById(empId);
    if (!emp || emp.manager?.toString() !== id) {
      return next(new AppError('Not authorised to view this goal sheet', 403));
    }
  }

  res.json({ success: true, data: sheet });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Create or update (save as draft) goal sheet
// @route  POST /api/goalsheets
// @access Private – employee only
export const saveGoalSheet = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'employee') {
    return next(new AppError('Only employees can create goal sheets', 403));
  }

  const cycle = await getActiveCycle();
  const { goals } = req.body;

  if (!goals || !Array.isArray(goals) || goals.length === 0) {
    return next(new AppError('At least one goal is required', 400));
  }

  // BRD validations
  if (goals.length > 8) {
    return next(new AppError('Maximum 8 goals are allowed per employee', 400));
  }
  const totalWt = goals.reduce((s, g) => s + Number(g.weightage || 0), 0);
  if (Math.round(totalWt) !== 100) {
    return next(new AppError(`Total weightage must equal 100%. Current total: ${totalWt}%`, 400));
  }
  for (const g of goals) {
    if (Number(g.weightage) < 10) {
      return next(new AppError(`Minimum weightage per goal is 10%. Goal "${g.title}" has ${g.weightage}%`, 400));
    }
  }

  // Check for existing sheet
  let sheet = await GoalSheet.findOne({ employee: req.user.id, cycle: cycle._id });

  if (sheet) {
    if (sheet.isLocked) {
      return next(new AppError('Your goal sheet is locked. Request an unlock from Admin to make changes.', 400));
    }
    if (sheet.status === 'approved') {
      return next(new AppError('Approved goal sheets cannot be edited without an admin unlock.', 400));
    }
    // Update existing draft/rework
    sheet.goals = goals;
    sheet.status = 'draft';
    sheet.reworkComment = null;
    await sheet.save();
    await audit(req.user.id, 'GOALSHEET_UPDATED', sheet._id, { goals }, req);
  } else {
    sheet = await GoalSheet.create({ employee: req.user.id, cycle: cycle._id, goals, status: 'draft' });
    await audit(req.user.id, 'GOALSHEET_CREATED', sheet._id, { goals }, req);
  }

  const populated = await GoalSheet.findById(sheet._id)
    .populate('employee', 'firstName lastName email')
    .populate('cycle', 'name startDate endDate');

  res.status(201).json({ success: true, message: 'Goal sheet saved as draft.', data: populated });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Submit goal sheet for manager approval
// @route  POST /api/goalsheets/:id/submit
// @access Private – employee only
export const submitGoalSheet = asyncHandler(async (req, res, next) => {
  const sheet = await GoalSheet.findById(req.params.id);
  if (!sheet) return next(new AppError('Goal sheet not found', 404));
  if (sheet.employee.toString() !== req.user.id) {
    return next(new AppError('Not authorised', 403));
  }
  if (sheet.isLocked) return next(new AppError('Goal sheet is locked.', 400));
  if (!['draft', 'rework'].includes(sheet.status)) {
    return next(new AppError(`Cannot submit a sheet in '${sheet.status}' status`, 400));
  }

  // Re-validate before submit
  if (sheet.goals.length < 1 || sheet.goals.length > 8) {
    return next(new AppError('Goal sheet must have 1–8 goals', 400));
  }
  const total = sheet.goals.reduce((s, g) => s + Number(g.weightage), 0);
  if (Math.round(total) !== 100) {
    return next(new AppError(`Total weightage is ${total}%. Must be 100% before submitting.`, 400));
  }

  sheet.status = 'submitted';
  sheet.submittedAt = new Date();
  await sheet.save();

  // Notify manager
  const emp = await User.findById(req.user.id);
  if (emp?.manager) {
    await notify(emp.manager, 'approval_request', 'Goal Sheet Submitted',
      `${emp.firstName} ${emp.lastName} has submitted their goal sheet for approval.`,
      `/goalsheets/${sheet._id}`);
  }

  await audit(req.user.id, 'GOALSHEET_SUBMITTED', sheet._id, { submittedAt: sheet.submittedAt }, req);
  res.json({ success: true, message: 'Goal sheet submitted for approval.', data: sheet });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Approve goal sheet (manager / admin) — locks it
// @route  POST /api/goalsheets/:id/approve
// @access Private – manager, admin
export const approveGoalSheet = asyncHandler(async (req, res, next) => {
  if (!['manager', 'admin'].includes(req.user.role)) {
    return next(new AppError('Only managers or admins can approve goal sheets', 403));
  }

  const sheet = await GoalSheet.findById(req.params.id).populate('employee', 'firstName lastName manager');
  if (!sheet) return next(new AppError('Goal sheet not found', 404));

  if (sheet.status !== 'submitted') {
    return next(new AppError(`Cannot approve a sheet in '${sheet.status}' status`, 400));
  }

  // Manager can only approve their direct reports' sheets
  if (req.user.role === 'manager') {
    if (sheet.employee.manager?.toString() !== req.user.id) {
      return next(new AppError('You can only approve goal sheets for your direct reports', 403));
    }
  }

  sheet.status = 'approved';
  sheet.isLocked = true;
  sheet.approvedAt = new Date();
  sheet.approvedBy = req.user.id;
  sheet.reworkComment = null;
  await sheet.save();

  // Notify employee
  await notify(sheet.employee._id, 'goal_approved', 'Goal Sheet Approved',
    `Your goal sheet has been approved and locked by ${req.user.firstName} ${req.user.lastName}.`,
    `/goalsheets/${sheet._id}`);

  await audit(req.user.id, 'GOALSHEET_APPROVED', sheet._id, { approvedAt: sheet.approvedAt }, req);
  res.json({ success: true, message: 'Goal sheet approved and locked successfully.', data: sheet });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Return goal sheet for rework (manager inline edit + comment)
// @route  POST /api/goalsheets/:id/rework
// @access Private – manager, admin
export const returnForRework = asyncHandler(async (req, res, next) => {
  if (!['manager', 'admin'].includes(req.user.role)) {
    return next(new AppError('Only managers or admins can return goal sheets', 403));
  }

  const { comment, editedGoals } = req.body;
  if (!comment?.trim()) return next(new AppError('A rework comment is required', 400));

  const sheet = await GoalSheet.findById(req.params.id).populate('employee', 'firstName lastName manager');
  if (!sheet) return next(new AppError('Goal sheet not found', 404));
  if (sheet.status !== 'submitted') {
    return next(new AppError(`Cannot return a sheet in '${sheet.status}' status`, 400));
  }

  // Manager access check
  if (req.user.role === 'manager' && sheet.employee.manager?.toString() !== req.user.id) {
    return next(new AppError('You can only return goal sheets for your direct reports', 403));
  }

  // Optional: manager edits targets/weightages inline before returning
  if (editedGoals && Array.isArray(editedGoals)) {
    // Validate inline-edited goals
    const total = editedGoals.reduce((s, g) => s + Number(g.weightage || 0), 0);
    if (Math.round(total) !== 100) {
      return next(new AppError(`Edited goals total weightage is ${total}%. Must be 100%.`, 400));
    }
    sheet.goals = editedGoals;
  }

  sheet.status = 'rework';
  sheet.reworkComment = comment;
  await sheet.save();

  // Notify employee
  await notify(sheet.employee._id, 'goal_rejected', 'Goal Sheet Returned for Rework',
    `Your goal sheet was returned for rework by ${req.user.firstName} ${req.user.lastName}. Reason: ${comment}`,
    `/goalsheets/${sheet._id}`);

  await audit(req.user.id, 'GOALSHEET_RETURNED_REWORK', sheet._id, { comment, editedGoals }, req);
  res.json({ success: true, message: 'Goal sheet returned for rework.', data: sheet });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Push a shared goal to multiple employees (admin / manager)
// @route  POST /api/goalsheets/shared-goal
// @access Private – manager, admin
export const pushSharedGoal = asyncHandler(async (req, res, next) => {
  if (!['manager', 'admin'].includes(req.user.role)) {
    return next(new AppError('Only managers or admins can push shared goals', 403));
  }

  const { sharedGoal, employeeIds } = req.body;
  // sharedGoal: { title, description, thrustArea, uom, target }
  // employeeIds: array of user IDs to push to

  if (!sharedGoal || !employeeIds?.length) {
    return next(new AppError('sharedGoal object and employeeIds array are required', 400));
  }

  const cycle = await getActiveCycle();
  const results = { pushed: [], skipped: [], errors: [] };

  for (const empId of employeeIds) {
    try {
      let sheet = await GoalSheet.findOne({ employee: empId, cycle: cycle._id });

      const newGoalItem = {
        ...sharedGoal,
        weightage: sharedGoal.defaultWeightage || 10, // employee may adjust later
        isShared: true,
        sharedBy: req.user.id,
      };

      if (sheet) {
        if (sheet.isLocked) { results.skipped.push(empId); continue; }
        // Check if this shared goal already pushed
        const alreadyPushed = sheet.goals.some(
          g => g.isShared && g.title === sharedGoal.title && g.sharedBy?.toString() === req.user.id
        );
        if (alreadyPushed) { results.skipped.push(empId); continue; }

        // Check max goals limit
        if (sheet.goals.length >= 8) { results.skipped.push(empId); continue; }

        sheet.goals.push(newGoalItem);
        // Note: employee needs to re-balance weightage — do NOT auto-rebalance
        // Save without full validation so we don't break their draft
        await GoalSheet.findByIdAndUpdate(sheet._id, { $push: { goals: newGoalItem } });
      } else {
        sheet = await GoalSheet.create({
          employee: empId,
          cycle: cycle._id,
          goals: [newGoalItem],
          status: 'draft',
        });
      }

      // Notify employee
      await notify(empId, 'goal_assigned', 'Shared Goal Added to Your Sheet',
        `${req.user.firstName} ${req.user.lastName} added a shared goal: "${sharedGoal.title}" to your goal sheet.`,
        `/goalsheets`);

      results.pushed.push(empId);
    } catch (err) {
      results.errors.push({ empId, error: err.message });
    }
  }

  await audit(req.user.id, 'SHARED_GOAL_PUSHED', 'bulk', { sharedGoal, employeeIds, results }, req);
  res.json({
    success: true,
    message: `Shared goal pushed to ${results.pushed.length} employee(s).`,
    data: results,
  });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Update weightage of a shared goal (employee only — title/target locked)
// @route  PATCH /api/goalsheets/:sheetId/goals/:goalId/weightage
// @access Private – employee
export const updateSharedGoalWeightage = asyncHandler(async (req, res, next) => {
  const { weightage } = req.body;
  if (!weightage || Number(weightage) < 10) {
    return next(new AppError('Weightage must be at least 10%', 400));
  }

  const sheet = await GoalSheet.findById(req.params.sheetId);
  if (!sheet) return next(new AppError('Goal sheet not found', 404));
  if (sheet.employee.toString() !== req.user.id) return next(new AppError('Not authorised', 403));
  if (sheet.isLocked) return next(new AppError('Goal sheet is locked', 400));

  const goal = sheet.goals.id(req.params.goalId);
  if (!goal) return next(new AppError('Goal not found in sheet', 404));
  if (!goal.isShared) return next(new AppError('Only shared goals can be updated via this endpoint', 400));

  goal.weightage = Number(weightage);
  await sheet.save();

  res.json({ success: true, message: 'Shared goal weightage updated.', data: sheet });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Request goal sheet unlock (employee)
// @route  POST /api/goalsheets/:id/unlock-request
// @access Private – employee
export const requestUnlock = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;
  if (!reason?.trim()) return next(new AppError('Please provide a reason for the unlock request', 400));

  const sheet = await GoalSheet.findById(req.params.id);
  if (!sheet) return next(new AppError('Goal sheet not found', 404));
  if (sheet.employee.toString() !== req.user.id) return next(new AppError('Not authorised', 403));
  if (!sheet.isLocked) return next(new AppError('Goal sheet is not locked', 400));

  // Check no pending request
  const hasPending = sheet.unlockRequests.some(r => r.status === 'pending');
  if (hasPending) return next(new AppError('You already have a pending unlock request', 400));

  sheet.unlockRequests.push({ requestedBy: req.user.id, reason });
  await sheet.save();

  // Notify all admins
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const admin of admins) {
    await notify(admin._id, 'system_alert', 'Goal Sheet Unlock Request',
      `${req.user.firstName} ${req.user.lastName} requested goal sheet unlock. Reason: ${reason}`,
      `/admin/unlock-requests`);
  }

  await audit(req.user.id, 'UNLOCK_REQUEST_CREATED', sheet._id, { reason }, req);
  res.json({ success: true, message: 'Unlock request submitted. Admin will review shortly.' });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Approve or reject unlock request (admin only)
// @route  PATCH /api/goalsheets/:id/unlock-request/:requestId
// @access Private – admin
export const resolveUnlockRequest = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'admin') return next(new AppError('Only admins can resolve unlock requests', 403));

  const { action } = req.body; // 'approve' | 'reject'
  if (!['approve', 'reject'].includes(action)) {
    return next(new AppError("action must be 'approve' or 'reject'", 400));
  }

  const sheet = await GoalSheet.findById(req.params.id).populate('employee', 'firstName lastName');
  if (!sheet) return next(new AppError('Goal sheet not found', 404));

  const request = sheet.unlockRequests.id(req.params.requestId);
  if (!request) return next(new AppError('Unlock request not found', 404));
  if (request.status !== 'pending') return next(new AppError('Request already resolved', 400));

  request.status = action === 'approve' ? 'approved' : 'rejected';
  request.resolvedAt = new Date();
  request.resolvedBy = req.user.id;

  if (action === 'approve') {
    sheet.isLocked = false;
    sheet.status = 'draft';
    await notify(sheet.employee._id, 'system_alert', 'Goal Sheet Unlocked',
      'Your goal sheet has been unlocked. You may now edit and resubmit.',
      `/goalsheets/${sheet._id}`);
  } else {
    await notify(sheet.employee._id, 'system_alert', 'Unlock Request Rejected',
      'Your goal sheet unlock request was rejected by Admin.',
      `/goalsheets/${sheet._id}`);
  }

  await sheet.save();
  await audit(req.user.id, `UNLOCK_REQUEST_${action.toUpperCase()}D`, sheet._id, { requestId: req.params.requestId }, req);
  res.json({ success: true, message: `Unlock request ${action}d.`, data: sheet });
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Export goal sheets as CSV data (admin / manager)
// @route  GET /api/goalsheets/export
// @access Private – admin, manager
export const exportGoalSheets = asyncHandler(async (req, res, next) => {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return next(new AppError('Not authorised to export', 403));
  }

  let filter = {};
  if (req.user.role === 'manager') {
    const team = await User.find({ manager: req.user.id }).select('_id');
    filter.employee = { $in: team.map(u => u._id) };
  }

  const sheets = await GoalSheet.find(filter)
    .populate('employee', 'firstName lastName email department position')
    .populate('cycle', 'name fiscalYear quarter');

  // Build CSV rows
  const rows = [
    ['Employee', 'Email', 'Department', 'Cycle', 'Goal #', 'Title', 'Thrust Area',
     'UoM', 'Target', 'Weightage (%)', 'Status', 'Sheet Status',
     'Q1 Actual', 'Q2 Actual', 'Q3 Actual', 'Q4 Actual'].join(',')
  ];

  for (const sheet of sheets) {
    const empName = `${sheet.employee.firstName} ${sheet.employee.lastName}`;
    sheet.goals.forEach((g, idx) => {
      rows.push([
        `"${empName}"`,
        `"${sheet.employee.email}"`,
        `"${sheet.employee.department || ''}"`,
        `"${sheet.cycle?.name || ''}"`,
        idx + 1,
        `"${g.title}"`,
        `"${g.thrustArea}"`,
        g.uom,
        `"${g.target}"`,
        g.weightage,
        g.q3Status || 'not_started',
        sheet.status,
        g.q1Actual ?? '',
        g.q2Actual ?? '',
        g.q3Actual ?? '',
        g.q4Actual ?? '',
      ].join(','));
    });
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=goal-sheets.csv');
  res.status(200).send(rows.join('\n'));
});

// ─────────────────────────────────────────────────────────────────────────
// @desc   Dashboard stats for goal sheets
// @route  GET /api/goalsheets/stats
// @access Private
export const getGoalSheetStats = asyncHandler(async (req, res) => {
  const { role, id } = req.user;
  let filter = {};

  if (role === 'employee') {
    filter.employee = id;
  } else if (role === 'manager') {
    const team = await User.find({ manager: id }).select('_id');
    filter.employee = { $in: team.map(u => u._id) };
  }

  const [total, submitted, approved, rework, draft] = await Promise.all([
    GoalSheet.countDocuments(filter),
    GoalSheet.countDocuments({ ...filter, status: 'submitted' }),
    GoalSheet.countDocuments({ ...filter, status: 'approved' }),
    GoalSheet.countDocuments({ ...filter, status: 'rework' }),
    GoalSheet.countDocuments({ ...filter, status: 'draft' }),
  ]);

  const pendingUnlocks = await GoalSheet.countDocuments({
    ...filter,
    'unlockRequests.status': 'pending',
  });

  res.json({
    success: true,
    data: { total, submitted, approved, rework, draft, pendingUnlocks },
  });
});
