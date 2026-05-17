// ADD THIS to backend/controllers/authController.js
// @desc   Get all users (admin/manager use)
// @route  GET /api/auth/users
// @access Private – admin, manager

import User from '../models/User.js';
import { asyncHandler, AppError } from '../middleware/error.js';
import { generateToken, generateRefreshToken } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';

export const getUsers = asyncHandler(async (req, res, next) => {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return next(new AppError('Not authorised', 403));
  }
  let filter = { isActive: true };
  if (req.user.role === 'manager') {
    filter.manager = req.user.id;
  }
  const users = await User.find(filter).select('-password -refreshToken -resetPasswordToken').sort({ firstName: 1 });
  res.json({ success: true, count: users.length, data: users });
});
