# KU-Fleet

A comprehensive fleet management system with real-time GPS tracking, passenger RFID monitoring, route management, and analytics for bus fleet operations.

## 🚀 Features

- **Real-time GPS Tracking**: Live location tracking of buses using GT06 GPS protocol
- **RFID Passenger Tracking**: Monitor passenger boarding and alighting via RFID cards
- **Route Management**: Define and manage bus routes with stations
- **Driver Management**: Assign and manage drivers for buses
- **Analytics Dashboard**: Comprehensive analytics on trips, routes, and bus performance
- **Alert System**: Real-time alerts for speed violations, route deviations, and system events
- **Socket.IO Integration**: Real-time updates via WebSocket connections
- **Student Feedback**: Collect and manage student feedback on bus services
- **Media Management**: Upload and manage images via Cloudinary integration
- **TCP Server**: Dedicated TCP server for GPS tracker device communication

## 📋 Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Docker Deployment](#docker-deployment)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Contributing](#contributing)

## 🛠 Tech Stack

### Backend

- **Runtime**: Node.js
- **Framework**: Express.js 5.x
- **Language**: TypeScript
- **Database**: MongoDB (Mongoose)
- **Cache**: Redis (ioredis / Upstash)
- **Real-time**: Socket.IO
- **Task Queue**: BullMQ
- **File Upload**: Cloudinary, Multer
- **Authentication**: JWT (jsonwebtoken)
- **GPS Protocol**: GT06
- **Other**: Node-cron, Helmet, CORS

### Frontend

- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **UI Library**: Radix UI + shadcn/ui
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod
- **Maps**: Google Maps API (React Google Maps)
- **Routing**: React Router DOM
- **Charts**: Recharts
- **Real-time**: Socket.IO Client

## 📁 Project Structure

```
KU-Fleet/
├── KU-Fleet-Backend/          # Backend API Server
│   ├── src/
│   │   ├── app.ts             # Express app configuration
│   │   ├── server.ts          # HTTP server + Socket.IO setup
│   │   ├── tcpServer.ts       # TCP server for GPS devices
│   │   ├── config/            # Configuration files
│   │   │   ├── db.ts         # MongoDB connection
│   │   │   ├── redis.ts      # Redis client
│   │   │   └── cloudinary.ts # Cloudinary config
│   │   ├── controllers/       # Route controllers
│   │   ├── models/            # MongoDB models
│   │   ├── routes/            # API routes
│   │   ├── middleware/        # Express middleware
│   │   ├── services/          # Business logic services
│   │   ├── workers/           # Background jobs (BullMQ)
│   │   ├── sockets/           # Socket.IO handlers
│   │   ├── utils/             # Utility functions
│   │   └── interfaces/        # TypeScript interfaces
│   ├── docker-compose.yml     # Docker Compose configuration
│   ├── package.json
│   └── tsconfig.json
│
└── KU-Fleet-Frontend/         # React Frontend Application
    ├── src/
    │   ├── api/               # API client functions
    │   ├── components/        # React components
    │   ├── pages/             # Page components
    │   ├── hooks/             # Custom React hooks
    │   ├── store/             # Zustand stores
    │   ├── config/            # Configuration
    │   ├── lib/               # Utilities and helpers
    │   ├── services/          # Business services
    │   ├── App.tsx            # Main app component
    │   └── main.tsx           # Entry point
    ├── public/                # Static assets
    ├── package.json
    ├── vite.config.ts
    └── tailwind.config.ts
```

## ✅ Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** or **yarn** or **bun**
- **MongoDB** (local or MongoDB Atlas account)
- **Redis** (local or Upstash account)
- **Git**
- **Docker** and **Docker Compose** (optional, for containerized deployment)

## 📦 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd KU-Fleet
```

### 2. Install Backend Dependencies

```bash
cd KU-Fleet-Backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../KU-Fleet-Frontend
npm install
```

## ⚙️ Configuration

### Backend Environment Variables

Create a `.env` file in the `KU-Fleet-Backend` directory:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
TCP_PORT=5050
CORS_ORIGIN=http://localhost:8080

# Database
MONGO_URI=mongodb://localhost:27017/ku-fleet
# OR for MongoDB Atlas:
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/ku-fleet

# Redis Configuration
REDIS_URL=redis://localhost:6379
# OR for Upstash Redis:
# REDIS_URL=rediss://default:password@hostname.upstash.io:6379

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Cloudinary Configuration (for image uploads)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# GPS Handler Configuration (Optional - defaults provided)
STATION_PROXIMITY_METERS=60
MIN_SPEED_KMH=5
REDIS_LOCATION_THROTTLE_SEC=10
ALERT_DEDUPE_SECONDS=120
INACTIVITY_MINUTES=30
SPEED_LIMIT_KMH=80
BUS_CACHE_TTL_SEC=180

# Data Retention (Optional - defaults provided)
TRIP_RETENTION_DAYS=7
ALERT_RETENTION_DAYS=30

# MTX Camera Configuration (Optional)
MTX_STREAMING_NODE=http://your-mtx-server:8083
```

### Frontend Environment Variables

Create a `.env` file in the `KU-Fleet-Frontend` directory:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3000

# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

## 🚀 Running the Application

### Development Mode

#### Backend

```bash
cd KU-Fleet-Backend
npm run dev
```

The backend server will start on:
- **HTTP Server**: `http://localhost:3000`
- **TCP Server**: `localhost:5050`
- **Socket.IO**: Available on the same HTTP port

#### Frontend

```bash
cd KU-Fleet-Frontend
npm run dev
```

The frontend will start on `http://localhost:8080`

### Production Mode

#### Backend

```bash
cd KU-Fleet-Backend
npm run build
npm start
```

#### Frontend

```bash
cd KU-Fleet-Frontend
npm run build
npm run preview
```

The production build will be in the `dist` folder.

## 🐳 Docker Deployment

### Using Docker Compose

1. **Navigate to Backend Directory**

```bash
cd KU-Fleet-Backend
```

2. **Create `.env` file** (see Configuration section above)

3. **Build and Start Services**

```bash
docker-compose up -d
```

This will start:
- Backend API server
- MongoDB (if using local instance)
- Redis (if using local instance)

4. **View Logs**

```bash
docker-compose logs -f
```

5. **Stop Services**

```bash
docker-compose down
```

### Docker Compose Services

- **Backend**: Exposed on ports 3000 (HTTP) and 5050 (TCP)
- **MongoDB**: Exposed on port 27017
- **Redis**: Exposed on port 6379

**Note**: For production, use managed services (MongoDB Atlas, Upstash Redis) instead of containerized databases.

## 📡 API Documentation

### Base URL

- **Development**: `http://localhost:3000`
- **Production**: Update `VITE_API_BASE_URL` in frontend `.env`

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

### Main API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

#### Buses
- `GET /api/buses` - Get all buses
- `POST /api/buses` - Create new bus
- `GET /api/buses/:id` - Get bus details
- `PUT /api/buses/:id` - Update bus
- `DELETE /api/buses/:id` - Delete bus

#### Drivers
- `GET /api/drivers` - Get all drivers
- `POST /api/drivers` - Create new driver
- `GET /api/drivers/:id` - Get driver details
- `PUT /api/drivers/:id` - Update driver
- `DELETE /api/drivers/:id` - Delete driver

#### Routes
- `GET /api/routes` - Get all routes
- `POST /api/routes` - Create new route
- `GET /api/routes/:id` - Get route details
- `PUT /api/routes/:id` - Update route
- `DELETE /api/routes/:id` - Delete route

#### Stations
- `GET /api/stations` - Get all stations
- `POST /api/stations` - Create new station
- `GET /api/stations/:id` - Get station details
- `PUT /api/stations/:id` - Update station
- `DELETE /api/stations/:id` - Delete station

#### Trip Logs
- `GET /api/tripLogs` - Get all trip logs
- `GET /api/tripLogs/:id` - Get trip details
- `GET /api/tripLogs/bus/:busId` - Get trips for a bus

#### Analytics
- `GET /api/analytics/daily` - Daily analytics
- `GET /api/analytics/bus/:busId` - Bus-specific analytics
- `GET /api/analytics/route/:routeId` - Route-specific analytics

#### Alerts
- `GET /api/alerts` - Get all alerts
- `GET /api/alerts/stats` - Get alert statistics
- `GET /api/alerts/bus/:busId` - Get alerts for a bus
- `PUT /api/alerts/:id` - Update alert (resolve, etc.)

#### RFID
- `GET /api/rfid/logs` - Get RFID logs
- `POST /api/rfid/logs` - Create RFID log entry

#### Feedback
- `GET /api/feedback` - Get all feedback
- `POST /api/feedback` - Submit feedback

#### Upload
- `POST /api/upload` - Upload image to Cloudinary

For complete API documentation, refer to `KU-Fleet-Backend/API_ENDPOINTS.md` or import the Postman collection: `KU-Fleet-Backend/KU-Fleet-API.postman_collection.json`

## 🔌 Socket.IO Events

### Client → Server

- `joinRoom` - Join a room (admin, student, bus:{busId}, imei:{imei})

### Server → Client

- `gpsUpdate` - GPS location update for a bus
- `tripStarted` - Trip started event
- `tripEnded` - Trip ended event
- `alert` - New alert created
- `rfidEvent` - RFID card scanned event

### Rooms

- `admins` - Admin users
- `students` - Student users
- `bus:{busId}` - Specific bus updates
- `imei:{imei}` - Specific device updates

## 🔐 Environment Variables Reference

### Backend Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/ku-fleet` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret key for JWT tokens | `your-secret-key` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `your-api-key` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `your-api-secret` |

### Backend Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `TCP_PORT` | `5050` | TCP server port for GPS devices |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `STATION_PROXIMITY_METERS` | `60` | Distance threshold for station detection |
| `MIN_SPEED_KMH` | `5` | Minimum speed to consider bus moving |
| `SPEED_LIMIT_KMH` | `80` | Speed limit for speed alerts |
| `REDIS_LOCATION_THROTTLE_SEC` | `10` | Throttle interval for Redis location writes |
| `ALERT_DEDUPE_SECONDS` | `120` | Alert deduplication window |
| `INACTIVITY_MINUTES` | `30` | Minutes of inactivity before ending trip |
| `BUS_CACHE_TTL_SEC` | `180` | Bus location cache TTL |
| `TRIP_RETENTION_DAYS` | `7` | Days to retain trip logs |
| `ALERT_RETENTION_DAYS` | `30` | Days to retain alerts |

### Frontend Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:3000` |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key | `your-api-key` |

## 🧪 Development

### Backend Scripts

```bash
# Development mode with hot reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Start production server
npm start

# Post-install build (runs automatically after npm install)
npm run postinstall
```

### Frontend Scripts

```bash
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Code Structure Guidelines

- **Backend**: Follow TypeScript strict mode. Controllers handle HTTP, services contain business logic, workers handle background jobs.
- **Frontend**: Use TypeScript for type safety. Components in `components/`, pages in `pages/`, hooks in `hooks/`, stores in `store/`.

## 🔧 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running locally or verify Atlas connection string
   - Check firewall settings for MongoDB Atlas

2. **Redis Connection Error**
   - Ensure Redis is running locally
   - For Upstash, verify the Redis URL format (should use `rediss://` for SSL)

3. **Port Already in Use**
   - Change `PORT` or `TCP_PORT` in backend `.env`
   - Kill the process using the port: `npx kill-port 3000`

4. **CORS Errors**
   - Verify `CORS_ORIGIN` in backend `.env` matches frontend URL
   - Ensure backend allows frontend origin

5. **GPS Tracker Not Connecting**
   - Verify TCP port (default: 5050) is accessible
   - Check firewall rules for TCP connections
   - Ensure GT06 protocol is supported by your GPS device

6. **Frontend Cannot Connect to Backend**
   - Verify `VITE_API_BASE_URL` in frontend `.env`
   - Ensure backend is running
   - Check browser console for CORS or network errors

## 📝 License

[Specify your license here]

## 👥 Contributing

[Add contribution guidelines here]

## 📞 Support

For issues, questions, or contributions, please open an issue on the repository.

---

**KU-Fleet** - Comprehensive Fleet Management System
