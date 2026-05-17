import User from '../models/User.js';
import { generateToken, generateRefreshToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/error.js';
import { AuditLog } from '../models/index.js';

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public (or Admin only for production)
export const register = asyncHandler(async (req, res, next) => {
  const { email, password, firstName, lastName, role, department, position, manager } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    return next(new AppError('User already exists', 400));
  }

  // Create user
  const user = await User.create({
    email,
    password,
    firstName,
    lastName,
    role: role || 'employee',
    department,
    position,
    manager
  });

  // Create audit log
  await AuditLog.create({
    user: user._id,
    action: 'USER_REGISTERED',
    entity: 'User',
    entityId: user._id.toString(),
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  // Generate tokens
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Save refresh token
  user.refreshToken = refreshToken;
  await user.save();

  res.status(201).json({
    success: true,
    data: {
      user,
      token,
      refreshToken
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // Check for user
  const user = await User.findOne({ email }).select('+password');

  if (!user || !user.isActive) {
    return next(new AppError('Invalid credentials', 401));
  }

  // Check password
  const isPasswordMatch = await user.comparePassword(password);

  if (!isPasswordMatch) {
    return next(new AppError('Invalid credentials', 401));
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Create audit log
  await AuditLog.create({
    user: user._id,
    action: 'USER_LOGIN',
    entity: 'User',
    entityId: user._id.toString(),
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  // Generate tokens
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Save refresh token
  user.refreshToken = refreshToken;
  await user.save();

  // Remove password from output
  user.password = undefined;

  res.status(200).json({
    success: true,
    data: {
      user,
      token,
      refreshToken
    }
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).populate('manager', 'firstName lastName email');

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = asyncHandler(async (req, res, next) => {
  // Clear refresh token
  await User.findByIdAndUpdate(req.user.id, { refreshToken: null });

  // Create audit log
  await AuditLog.create({
    user: req.user.id,
    action: 'USER_LOGOUT',
    entity: 'User',
    entityId: req.user.id.toString(),
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
export const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return next(new AppError('Refresh token required', 400));
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return next(new AppError('Invalid refresh token', 401));
    }

    // Generate new tokens
    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    return next(new AppError('Invalid refresh token', 401));
  }
});
