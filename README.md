# AtomQuest Enterprise Goal Portal

Modern enterprise-grade goal management platform with MongoDB backend and premium UI.

## 🚀 Quick Start

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URI
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

## 📦 Tech Stack

**Backend:**
- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- Socket.IO (Real-time)
- Winston Logger

**Frontend:**
- React 18
- Tailwind CSS
- Framer Motion
- Recharts
- Axios

## 🔑 Features

- Role-based access (Employee, Manager, Admin)
- Goal creation & tracking
- Real-time notifications
- Check-ins & approvals
- Analytics dashboard
- Audit trails
- File attachments

## 📄 API Endpoints

### Auth
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/logout

### Goals
- GET /api/goals
- POST /api/goals
- GET /api/goals/:id
- PUT /api/goals/:id
- DELETE /api/goals/:id
- GET /api/goals/stats/dashboard

## 🔐 Default Credentials

Admin: admin@atomquest.com / Admin@123
Manager: manager@atomquest.com / Manager@123
Employee: employee@atomquest.com / Employee@123
