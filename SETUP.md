# 🚀 AtomQuest Enterprise Portal - Complete Setup Guide

## Prerequisites
- Node.js 16+ and npm
- MongoDB installed and running locally OR MongoDB Atlas account

## Step 1: MongoDB Setup

### Option A: Local MongoDB
```bash
# Install MongoDB (Ubuntu/Debian)
sudo apt-get install mongodb

# Start MongoDB
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

### Option B: MongoDB Atlas (Cloud)
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free account
3. Create a new cluster
4. Get connection string and update backend/.env

## Step 2: Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Update .env file with your MongoDB URI
# For local: mongodb://localhost:27017/atomquest
# For Atlas: mongodb+srv://username:password@cluster.mongodb.net/atomquest

# Seed database with sample data
npm run seed

# Start backend server
npm run dev
```

Backend will run on http://localhost:5000

## Step 3: Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Start frontend
npm start
```

Frontend will run on http://localhost:3000

## 🔐 Test Credentials

**Admin Account:**
- Email: admin@atomquest.com
- Password: Admin@123

**Manager Account:**
- Email: manager@atomquest.com
- Password: Manager@123

**Employee Account:**
- Email: employee@atomquest.com
- Password: Employee@123

## 📁 Project Structure

```
atomquest-enterprise-portal/
├── backend/
│   ├── models/          # MongoDB models
│   ├── controllers/     # Business logic
│   ├── routes/          # API routes
│   ├── middleware/      # Auth & error handling
│   ├── config/          # Database config
│   ├── utils/           # Utilities
│   └── server.js        # Entry point
│
└── frontend/
    ├── src/
    │   ├── components/  # React components
    │   ├── pages/       # Page components
    │   ├── store/       # Zustand state management
    │   ├── utils/       # Utilities
    │   └── App.jsx      # Main app
    └── public/
```

## 🎨 Features

✅ **Authentication & Authorization**
- JWT-based authentication
- Role-based access control (Admin, Manager, Employee)
- Secure password hashing

✅ **Goal Management**
- Create, read, update, delete goals
- Goal hierarchies (parent-child relationships)
- Progress tracking with metrics
- Status workflow

✅ **Premium UI**
- Glassmorphism design
- Framer Motion animations
- Responsive layouts
- Dark mode sidebar

✅ **Real-time Features**
- Socket.IO for live updates
- Real-time notifications
- Live goal progress updates

✅ **Analytics**
- Dashboard with statistics
- Charts and graphs (Recharts)
- Progress visualization

✅ **Audit & Security**
- Audit trail logging
- Rate limiting
- Input validation
- XSS protection

## 🔧 API Endpoints

### Authentication
- POST /api/auth/register - Register new user
- POST /api/auth/login - Login
- GET /api/auth/me - Get current user
- POST /api/auth/logout - Logout

### Goals
- GET /api/goals - Get all goals
- POST /api/goals - Create goal
- GET /api/goals/:id - Get single goal
- PUT /api/goals/:id - Update goal
- DELETE /api/goals/:id - Delete goal
- POST /api/goals/:id/submit - Submit for approval
- GET /api/goals/stats/dashboard - Get statistics

## 🐛 Troubleshooting

**MongoDB Connection Error:**
- Check if MongoDB is running: `sudo systemctl status mongodb`
- Verify connection string in backend/.env

**Port Already in Use:**
- Change PORT in backend/.env
- Update REACT_APP_API_URL in frontend/.env

**CORS Errors:**
- Ensure FRONTEND_URL in backend/.env matches your frontend URL

## 📦 Production Deployment

### Backend (Node.js)
- Use PM2 for process management
- Set NODE_ENV=production
- Use MongoDB Atlas for database
- Enable SSL/TLS

### Frontend (React)
- Build: `npm run build`
- Deploy to Vercel, Netlify, or AWS S3
- Update API URL in environment variables

## 🚀 Next Steps

1. Customize branding (colors, logo, name)
2. Add more features (reporting, exports, etc.)
3. Implement email notifications
4. Add file upload capabilities
5. Set up CI/CD pipeline

## 📞 Support

For issues or questions, check:
- MongoDB Docs: https://docs.mongodb.com/
- React Docs: https://react.dev/
- Express Docs: https://expressjs.com/

---
Built with ❤️ using MongoDB, Express, React, and Node.js (MERN Stack)
