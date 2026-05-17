import Goal from '../models/Goal.js';
import { Approval, Notification, AuditLog } from '../models/index.js';
import { asyncHandler, AppError } from '../middleware/error.js';

// @desc    Get all goals (filtered by user role)
// @route   GET /api/goals
// @access  Private
export const getGoals = asyncHandler(async (req, res, next) => {
  const { status, type, priority, cycle, search } = req.query;
  let query = {};

  // Role-based filtering
  if (req.user.role === 'employee') {
    query.assignedTo = req.user.id;
  } else if (req.user.role === 'manager') {
    // Get user's direct reports
    const User = (await import('../models/User.js')).default;
    const employees = await User.find({ manager: req.user.id }).select('_id');
    const employeeIds = employees.map(emp => emp._id);
    
    query.$or = [
      { assignedTo: req.user.id },
      { assignedTo: { $in: employeeIds } },
      { createdBy: req.user.id }
    ];
  }
  // Admin sees all goals

  // Apply filters
  if (status) query.status = status;
  if (type) query.type = type;
  if (priority) query.priority = priority;
  if (cycle) query.cycle = cycle;
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const goals = await Goal.find(query)
    .populate('createdBy', 'firstName lastName email avatar')
    .populate('assignedTo', 'firstName lastName email avatar department')
    .populate('cycle', 'name startDate endDate')
    .populate('parentGoal', 'title')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: goals.length,
    data: goals
  });
});

// @desc    Get single goal
// @route   GET /api/goals/:id
// @access  Private
export const getGoal = asyncHandler(async (req, res, next) => {
  const goal = await Goal.findById(req.params.id)
    .populate('createdBy', 'firstName lastName email avatar')
    .populate('assignedTo', 'firstName lastName email avatar department position')
    .populate('cycle', 'name startDate endDate fiscalYear quarter')
    .populate('parentGoal', 'title status progress')
    .populate({
      path: 'childGoals',
      populate: { path: 'assignedTo', select: 'firstName lastName' }
    })
    .populate({
      path: 'checkIns',
      populate: { path: 'user', select: 'firstName lastName avatar' },
      options: { sort: { submittedAt: -1 }, limit: 10 }
    })
    .populate({
      path: 'comments',
      populate: { path: 'user', select: 'firstName lastName avatar' },
      options: { sort: { createdAt: -1 } }
    });

  if (!goal) {
    return next(new AppError('Goal not found', 404));
  }

  // Check authorization
  const hasAccess = 
    req.user.role === 'admin' ||
    goal.assignedTo._id.toString() === req.user.id ||
    goal.createdBy._id.toString() === req.user.id;

  if (!hasAccess && req.user.role === 'manager') {
    const User = (await import('../models/User.js')).default;
    const employee = await User.findById(goal.assignedTo._id);
    if (employee && employee.manager?.toString() === req.user.id) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    return next(new AppError('Not authorized to access this goal', 403));
  }

  res.status(200).json({
    success: true,
    data: goal
  });
});

// @desc    Create new goal
// @route   POST /api/goals
// @access  Private
export const createGoal = asyncHandler(async (req, res, next) => {
  const goalData = {
    ...req.body,
    createdBy: req.user.id,
    assignedTo: req.body.assignedTo || req.user.id
  };

  const goal = await Goal.create(goalData);

  // Create notification for assigned user if different from creator
  if (goal.assignedTo.toString() !== req.user.id) {
    await Notification.create({
      user: goal.assignedTo,
      type: 'goal_assigned',
      title: 'New Goal Assigned',
      message: `${req.user.firstName} ${req.user.lastName} assigned you a new goal: ${goal.title}`,
      link: `/goals/${goal._id}`,
      relatedEntity: { entityType: 'Goal', entityId: goal._id }
    });
  }

  // Create audit log
  await AuditLog.create({
    user: req.user.id,
    action: 'GOAL_CREATED',
    entity: 'Goal',
    entityId: goal._id.toString(),
    changes: goalData,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  const populatedGoal = await Goal.findById(goal._id)
    .populate('createdBy', 'firstName lastName email')
    .populate('assignedTo', 'firstName lastName email')
    .populate('cycle', 'name startDate endDate');

  res.status(201).json({
    success: true,
    data: populatedGoal
  });
});

// @desc    Update goal
// @route   PUT /api/goals/:id
// @access  Private
export const updateGoal = asyncHandler(async (req, res, next) => {
  let goal = await Goal.findById(req.params.id);

  if (!goal) {
    return next(new AppError('Goal not found', 404));
  }

  // Check authorization
  const canUpdate = 
    req.user.role === 'admin' ||
    goal.assignedTo.toString() === req.user.id ||
    goal.createdBy.toString() === req.user.id;

  if (!canUpdate) {
    return next(new AppError('Not authorized to update this goal', 403));
  }

  const oldGoal = goal.toObject();
  goal = await Goal.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  }).populate('createdBy assignedTo cycle');

  // Create audit log
  await AuditLog.create({
    user: req.user.id,
    action: 'GOAL_UPDATED',
    entity: 'Goal',
    entityId: goal._id.toString(),
    changes: { old: oldGoal, new: goal.toObject() },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    success: true,
    data: goal
  });
});

// @desc    Delete goal
// @route   DELETE /api/goals/:id
// @access  Private (Admin or Creator only)
export const deleteGoal = asyncHandler(async (req, res, next) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    return next(new AppError('Goal not found', 404));
  }

  // Only admin or creator can delete
  if (req.user.role !== 'admin' && goal.createdBy.toString() !== req.user.id) {
    return next(new AppError('Not authorized to delete this goal', 403));
  }

  await goal.deleteOne();

  // Create audit log
  await AuditLog.create({
    user: req.user.id,
    action: 'GOAL_DELETED',
    entity: 'Goal',
    entityId: goal._id.toString(),
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    success: true,
    message: 'Goal deleted successfully'
  });
});

// @desc    Submit goal for approval
// @route   POST /api/goals/:id/submit
// @access  Private
export const submitForApproval = asyncHandler(async (req, res, next) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    return next(new AppError('Goal not found', 404));
  }

  if (goal.assignedTo.toString() !== req.user.id) {
    return next(new AppError('Not authorized', 403));
  }

  goal.status = 'pending_approval';
  await goal.save();

  // Create approval request
  const User = (await import('../models/User.js')).default;
  const user = await User.findById(req.user.id);
  const approverId = user.manager || req.body.approverId;

  if (!approverId) {
    return next(new AppError('No approver found', 400));
  }

  await Approval.create({
    goal: goal._id,
    approver: approverId
  });

  // Send notification
  await Notification.create({
    user: approverId,
    type: 'approval_request',
    title: 'Goal Approval Request',
    message: `${user.firstName} ${user.lastName} submitted a goal for approval: ${goal.title}`,
    link: `/approvals`,
    relatedEntity: { entityType: 'Goal', entityId: goal._id }
  });

  res.status(200).json({
    success: true,
    data: goal
  });
});

// @desc    Get goal statistics
// @route   GET /api/goals/stats/dashboard
// @access  Private
export const getGoalStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const role = req.user.role;

  let matchQuery = {};
  
  if (role === 'employee') {
    matchQuery.assignedTo = userId;
  } else if (role === 'manager') {
    const User = (await import('../models/User.js')).default;
    const employees = await User.find({ manager: userId });
    const employeeIds = employees.map(emp => emp._id);
    employeeIds.push(userId);
    matchQuery.assignedTo = { $in: employeeIds };
  }

  const stats = await Goal.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgProgress: { $avg: '$progress' }
      }
    }
  ]);

  const priorityStats = await Goal.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      byStatus: stats,
      byPriority: priorityStats
    }
  });
});
