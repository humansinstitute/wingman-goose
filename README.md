# 🪿 =✪= Wingman: Goose Orchestrator

A comprehensive web-based orchestrator system for managing and interacting with multiple Goose AI sessions through a modern dashboard interface.

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Usage Instructions](#usage-instructions)
- [System Architecture](#system-architecture)
- [Features](#features)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)
- [Development](#development)

## 🎯 Project Overview

Wingman: Goose is an orchestrator system that provides a web-based interface for managing multiple Goose AI sessions. It combines a robust Node.js backend with a modern, responsive frontend to deliver real-time communication, session persistence, and comprehensive session management capabilities.

### Key Features

- **Multi-session Management**: Create, manage, and switch between multiple Goose sessions
- **Real-time Communication**: WebSocket-based live updates and messaging
- **Session Persistence**: MongoDB-backed storage for sessions and chat history
- **Modern Web Dashboard**: Responsive, dark-themed interface with real-time status indicators
- **RESTful API**: Complete API for programmatic access and integration
- **Authentication**: Token-based API security
- **Status Tracking**: Real-time session status monitoring (waiting, running, completed)

### Architecture Overview

The system follows a modern three-tier architecture:

- **Frontend**: Single-page web application with real-time WebSocket communication
- **Backend**: Express.js server with WebSocket support and MongoDB integration
- **Database**: MongoDB for persistent storage of sessions and messages
- **External Integration**: Direct integration with Goose CLI processes

## 🔧 Prerequisites

### Required Software

- **Node.js**: Version 16.0 or higher
- **MongoDB**: Version 4.4 or higher (running locally on default port 27017)
- **Goose CLI**: Latest version installed and accessible in PATH

### System Requirements

- **Operating System**: macOS, Linux, or Windows
- **RAM**: Minimum 4GB (8GB recommended for multiple sessions)
- **Storage**: At least 1GB free space for logs and database
- **Network**: Port 3000 available (or custom port via environment variable)

### Installation Instructions for Dependencies

#### Node.js Installation

```bash
# macOS (using Homebrew)
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
# Download from https://nodejs.org/
```

#### MongoDB Installation

```bash
# macOS (using Homebrew)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# Windows
# Download from https://www.mongodb.com/try/download/community
```

#### Goose CLI Installation

```bash
# Install Goose CLI (follow official Goose documentation)
# Ensure 'goose' command is available in your PATH
goose --version
```

## 🚀 Installation & Setup

### Step 1: Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd wingman-goose

# Install Node.js dependencies
npm install
```

### Step 2: Environment Configuration

Create a `.env` file in the project root (optional):

```bash
# .env file (optional - defaults will be used if not specified)
PORT=3000
API_TOKEN=your-secure-api-token-here
MONGODB_URI=mongodb://localhost:27017/goosedb
```

### Step 3: Database Setup

Ensure MongoDB is running:

```bash
# Check MongoDB status
# macOS
brew services list | grep mongodb

# Linux
sudo systemctl status mongod

# Start MongoDB if not running
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

The application will automatically create the `goosedb` database and required collections on first run.

### Step 4: Verify Goose CLI

```bash
# Verify Goose CLI is installed and accessible
goose --help

# Test creating a session (optional)
goose session --name "test-session"
```

## 📖 Usage Instructions

### Starting the Server

```bash
# Start the Wingman: Goose server
node server.js

# Alternative: Use nodemon for development (auto-restart)
npx nodemon server.js
```

Expected output:

```
Connected to MongoDB (goosedb)
Wingman: Goose Orchestrator running on port 3000
WebSocket server ready for real-time communication
API Token: default-token
```

### Accessing the Web Dashboard

1. Open your web browser
2. Navigate to `http://localhost:3000`
3. The dashboard will load automatically

### Creating and Managing Goose Sessions

#### Creating a New Session

1. Click the **"+ New Session"** button in the sidebar
2. Enter a descriptive name for your session
3. The session will be created and automatically selected
4. Wait for the session status to change from "waiting" to "running"

#### Interacting with Sessions

1. **Select a Session**: Click on any session in the sidebar to activate it
2. **Send Messages**: Type your prompt in the input area and press Enter or click Send
3. **View History**: All messages are automatically saved and displayed
4. **Monitor Status**: Watch the colored status indicator (green=waiting, orange=running, gray=completed)

#### Session Status Indicators

- 🟢 **Waiting**: Session is starting up, waiting for Goose to be ready
- 🟠 **Running**: Session is active and ready to receive prompts
- ⚫ **Completed**: Session has ended or been stopped

### Real-time Features

- **Live Updates**: Messages appear in real-time across all connected browsers
- **Status Changes**: Session status updates are broadcast immediately
- **Connection Status**: Monitor WebSocket connection in the top-right corner
- **Auto-reconnection**: Automatic reconnection if connection is lost

## 🏗️ System Architecture

### Backend Components

#### Express.js Server ([`server.js`](server.js))

- **HTTP Server**: Serves the dashboard and handles API requests
- **WebSocket Server**: Manages real-time communication
- **Process Management**: Spawns and manages Goose CLI processes
- **Authentication**: Token-based API security middleware

#### MongoDB Integration

- **Database**: `goosedb`
- **Collections**:
  - `sessions`: Session metadata and status
  - `messages`: Chat history and communication logs

#### WebSocket Communication

- **Real-time Messaging**: Instant message delivery
- **Status Broadcasting**: Live session status updates
- **Auto-reconnection**: Resilient connection management

### Frontend Components

#### Dashboard Interface ([`dashboard.html`](dashboard.html))

- **Responsive Design**: Mobile-friendly layout
- **Dark Theme**: Modern, eye-friendly interface
- **Real-time Updates**: WebSocket-powered live communication
- **Session Management**: Intuitive session switching and creation

#### Key UI Components

- **Sidebar**: Session list with status indicators
- **Chat Area**: Message history and input interface
- **Status Bar**: Connection and session status monitoring
- **Controls**: Session creation and management buttons

### API Endpoints

#### Session Management

- `POST /sessions` - Create new session
- `GET /sessions` - List all sessions
- `POST /sessions/:id/prompts` - Send prompt to session
- `POST /sessions/:id/stop` - Stop running session
- `POST /sessions/:id/resume` - Resume previous session
- `GET /sessions/:id/messages` - Get session chat history

#### System Endpoints

- `GET /health` - System health check
- `GET /` - Serve dashboard interface

### WebSocket Events

#### Client → Server

- Connection establishment
- Message acknowledgments

#### Server → Client

- `message`: New chat message
- `status_update`: Session status change

## ✨ Features

### Multi-session Management

- Create unlimited concurrent Goose sessions
- Switch between sessions seamlessly
- Persistent session storage
- Session resume capability

### Real-time Communication

- WebSocket-based instant messaging
- Live status updates
- Auto-reconnection on connection loss
- Cross-browser synchronization

### Session Persistence

- MongoDB-backed storage
- Complete chat history retention
- Session metadata tracking
- Automatic data persistence

### Authentication

- Token-based API security
- Configurable authentication tokens
- Secure endpoint protection

### Modern Web Interface

- Responsive design for all devices
- Dark theme for reduced eye strain
- Intuitive user experience
- Keyboard shortcuts support

### Status Tracking

- Real-time session status monitoring
- Visual status indicators
- Connection status display
- Process health monitoring

## 📚 API Reference

### Authentication

All API endpoints require authentication using a Bearer token:

```bash
Authorization: Bearer <API_TOKEN>
```

Default token: `default-token` (configure via environment variable)

### Endpoints

#### Create New Session

```http
POST /sessions
Content-Type: application/json
Authorization: Bearer <API_TOKEN>

{
  "name": "My Goose Session"
}
```

**Response:**

```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "My Goose Session",
  "status": "waiting",
  "startedAt": "2024-01-01T12:00:00.000Z"
}
```

#### List All Sessions

```http
GET /sessions
Authorization: Bearer <API_TOKEN>
```

**Response:**

```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "name": "My Goose Session",
    "status": "running",
    "startedAt": "2024-01-01T12:00:00.000Z"
  }
]
```

#### Send Prompt to Session

```http
POST /sessions/{sessionId}/prompts
Content-Type: application/json
Authorization: Bearer <API_TOKEN>

{
  "prompt": "Create a Python script that calculates fibonacci numbers"
}
```

**Response:**

```json
{
  "message": "Prompt sent successfully"
}
```

#### Get Session Messages

```http
GET /sessions/{sessionId}/messages
Authorization: Bearer <API_TOKEN>
```

**Response:**

```json
[
  {
    "id": "507f1f77bcf86cd799439012",
    "sender": "user",
    "text": "Create a Python script",
    "timestamp": "2024-01-01T12:00:00.000Z"
  },
  {
    "id": "507f1f77bcf86cd799439013",
    "sender": "goose",
    "text": "I'll help you create a Python script...",
    "timestamp": "2024-01-01T12:00:05.000Z"
  }
]
```

#### Stop Session

```http
POST /sessions/{sessionId}/stop
Authorization: Bearer <API_TOKEN>
```

**Response:**

```json
{
  "message": "Session stopped successfully"
}
```

#### Resume Session

```http
POST /sessions/{sessionId}/resume
Authorization: Bearer <API_TOKEN>
```

**Response:**

```json
{
  "message": "Session resumed successfully"
}
```

#### Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "OK",
  "message": "Wingman: Goose Orchestrator is running",
  "activeSessions": 2,
  "connectedClients": 1
}
```

### Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error description"
}
```

Common HTTP status codes:

- `400`: Bad Request (missing required fields)
- `401`: Unauthorized (missing or invalid token)
- `404`: Not Found (session not found)
- `500`: Internal Server Error

## 🔧 Troubleshooting

### Common Issues and Solutions

#### Server Won't Start

**Issue**: `Error: listen EADDRINUSE :::3000`
**Solution**: Port 3000 is already in use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process or use a different port
PORT=3001 node server.js
```

#### MongoDB Connection Failed

**Issue**: `MongoDB connection error: connect ECONNREFUSED`
**Solution**: MongoDB is not running

```bash
# Start MongoDB
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Verify MongoDB is running
mongo --eval "db.adminCommand('ismaster')"
```

#### Goose CLI Not Found

**Issue**: `Error starting Goose process: spawn goose ENOENT`
**Solution**: Goose CLI is not installed or not in PATH

```bash
# Verify Goose installation
which goose
goose --version

# If not found, install Goose CLI
# Follow official Goose installation instructions
```

#### WebSocket Connection Failed

**Issue**: Dashboard shows "Disconnected" status
**Solution**: Check server logs and network connectivity

```bash
# Check server logs for WebSocket errors
# Verify no firewall blocking WebSocket connections
# Try refreshing the browser page
```

#### Session Stuck in "Waiting" Status

**Issue**: Session never transitions to "running"
**Solution**: Check Goose CLI process

```bash
# Check server logs for Goose process errors
# Verify Goose CLI can start sessions manually:
goose session --name "test"
```

### Error Messages and Meanings

| Error Message                      | Meaning                               | Solution                             |
| ---------------------------------- | ------------------------------------- | ------------------------------------ |
| "Access token required"            | Missing Authorization header          | Add Bearer token to request          |
| "Invalid access token"             | Wrong API token                       | Check API_TOKEN environment variable |
| "Session name is required"         | Missing name in request body          | Provide session name                 |
| "Session not found or not running" | Invalid session ID or stopped session | Check session exists and is active   |
| "Failed to create session"         | Error starting Goose process          | Check Goose CLI installation         |

### Debug Tips

#### Enable Verbose Logging

```bash
# Set NODE_ENV for more detailed logs
NODE_ENV=development node server.js
```

#### Monitor MongoDB

```bash
# Connect to MongoDB and check collections
mongo goosedb
> show collections
> db.sessions.find()
> db.messages.find()
```

#### Check Process Status

```bash
# Monitor running processes
ps aux | grep goose
ps aux | grep node
```

#### Network Debugging

```bash
# Test API endpoints
curl -H "Authorization: Bearer default-token" http://localhost:3000/health

# Test WebSocket connection
# Use browser developer tools → Network → WS tab
```

## 🔒 Security Considerations

### API Token Usage

- **Change Default Token**: Always change the default API token in production
- **Environment Variables**: Store tokens in environment variables, not in code
- **Token Rotation**: Regularly rotate API tokens for enhanced security

```bash
# Set secure API token
export API_TOKEN="your-secure-random-token-here"
```

### Network Access Recommendations

- **Local Development**: Default configuration is suitable for local development
- **Production Deployment**: Consider additional security measures:
  - Reverse proxy (nginx/Apache) with SSL/TLS
  - Firewall rules to restrict access
  - VPN or private network access

### Tailscale Integration Notes

The system works excellently with Tailscale for secure remote access:

1. **Install Tailscale** on the server machine
2. **Start Wingman: Goose** on the server
3. **Access via Tailscale IP**: `http://tailscale-ip:3000`
4. **Secure by Default**: Tailscale provides encrypted, authenticated access

Example Tailscale setup:

```bash
# On server machine
sudo tailscale up
tailscale ip -4  # Get your Tailscale IP

# Start Wingman: Goose
node server.js

# Access from any Tailscale-connected device
# http://100.x.x.x:3000
```

### Data Protection

- **Database Security**: Secure MongoDB with authentication in production
- **Session Isolation**: Each session runs in isolated processes
- **Data Persistence**: All chat data is stored locally in MongoDB

## 🛠️ Development

### Project Structure

```
wingman-goose/
├── server.js              # Main backend server
├── dashboard.html          # Frontend dashboard
├── package.json           # Node.js dependencies
├── package-lock.json      # Dependency lock file
└── README.md              # This documentation
```

### Key Files Explained

#### [`server.js`](server.js:1)

The main backend server implementing:

- Express.js HTTP server with middleware
- WebSocket server for real-time communication
- MongoDB integration with Mongoose schemas
- Goose CLI process management
- RESTful API endpoints
- Authentication middleware

#### [`dashboard.html`](dashboard.html:1)

Complete frontend application featuring:

- Modern, responsive web interface
- WebSocket client for real-time updates
- Session management UI
- Chat interface with message history
- Error handling and loading states

#### [`package.json`](package.json:1)

Project configuration with dependencies:

- **express**: Web framework
- **mongoose**: MongoDB object modeling
- **ws**: WebSocket implementation
- **nodemon**: Development auto-restart (dev dependency)

### How to Extend the System

#### Adding New API Endpoints

1. **Define Route**: Add new route in [`server.js`](server.js:1)

```javascript
app.get("/api/new-endpoint", authenticateToken, async (req, res) => {
  // Implementation
});
```

2. **Update Frontend**: Add corresponding frontend functionality in [`dashboard.html`](dashboard.html:1)

#### Adding New WebSocket Events

1. **Server Side**: Extend [`handleWebSocketMessage()`](server.js:560) function
2. **Client Side**: Update WebSocket message handler in dashboard

#### Database Schema Changes

1. **Update Schemas**: Modify Mongoose schemas in [`server.js`](server.js:44)
2. **Migration**: Handle data migration if needed
3. **API Updates**: Update API endpoints to support new fields

#### UI Enhancements

1. **Styling**: Modify CSS in [`dashboard.html`](dashboard.html:7)
2. **Functionality**: Add JavaScript functions
3. **Components**: Create new UI components as needed

### Contributing Guidelines

1. **Code Style**: Follow existing code formatting and conventions
2. **Testing**: Test all changes thoroughly with multiple sessions
3. **Documentation**: Update README.md for any new features
4. **Error Handling**: Implement proper error handling and user feedback
5. **Security**: Ensure all new endpoints use authentication middleware

### Development Workflow

```bash
# 1. Start MongoDB
brew services start mongodb-community

# 2. Start development server with auto-restart
npx nodemon server.js

# 3. Open dashboard in browser
open http://localhost:3000

# 4. Test with multiple sessions
# Create several sessions and test concurrent usage

# 5. Monitor logs for errors
tail -f server.log  # if logging to file
```

### Performance Considerations

- **Session Limits**: Monitor system resources with multiple concurrent sessions
- **Database Indexing**: Consider adding indexes for large message collections
- **Memory Management**: Monitor Node.js memory usage with many active sessions
- **WebSocket Scaling**: Consider WebSocket clustering for high-concurrency scenarios

---

## 📄 License

This project is licensed under the ISC License - see the [`package.json`](package.json:10) file for details.

## 🤝 Support

For issues, questions, or contributions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review existing issues and documentation
3. Create detailed bug reports with system information
4. Include relevant log outputs and error messages

---

**Wingman: Goose Orchestrator** - Empowering seamless AI collaboration through intelligent session management.
