// Wingman: Goose Orchestrator System
// Complete backend server implementation

const express = require("express");
const mongoose = require("mongoose");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 3615;
const API_TOKEN = process.env.API_TOKEN || "default-token";

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API Token Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  if (token !== API_TOKEN) {
    return res.status(403).json({ error: "Invalid access token" });
  }

  next();
};

// MongoDB Connection
mongoose
  .connect("mongodb://localhost:27017/goosedb", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB (goosedb)");
    // Clean existing messages on startup
    setTimeout(() => cleanExistingMessages(), 1000);
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// Mongoose Schemas
const sessionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: { type: String, required: true, default: "waiting" }, // waiting, running, completed
  startedAt: { type: Date, default: Date.now },
});

const messageSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session",
    required: true,
  },
  sender: { type: String, required: true }, // 'user' or 'goose'
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const Session = mongoose.model("Session", sessionSchema);
const Message = mongoose.model("Message", messageSchema);

// In-memory process map to track running Goose CLI sessions
const processMap = new Map();

// WebSocket clients for broadcasting
let wsClients = new Set();

// Create HTTP server to support both Express and WebSocket
const server = http.createServer(app);

// WebSocket server setup
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("New WebSocket connection established");
  wsClients.add(ws);

  ws.on("message", (message) => {
    console.log("Received WebSocket message:", message.toString());
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
    wsClients.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    wsClients.delete(ws);
  });
});

// Broadcast message to all connected WebSocket clients
const broadcastMessage = (data) => {
  const message = JSON.stringify(data);
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Message parsing and filtering functions
function parseGooseOutput(rawText, sessionId) {
  const lines = rawText.toString().split("\n");
  const result = {
    chatMessages: [],
    systemLogs: [],
    shouldDisplay: false,
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // DEBUG: Log every line being processed
    console.log(`[${sessionId}] DEBUG: Processing line: "${trimmedLine}"`);

    // Check for session-specific chat message patterns
    // Pattern 1: Standard format [sessionId] sender: message
    const standardMatch = trimmedLine.match(
      /^\[([a-f0-9]+)\] (user|goose): (.+)$/
    );
    // Pattern 2: RAW format [sessionId] RAW: message (treat as goose message)
    const rawMatch = trimmedLine.match(/^\[([a-f0-9]+)\] RAW: (.+)$/);
    // Pattern 3: Direct goose output without RAW prefix
    const directMatch =
      trimmedLine.match(/^\[([a-f0-9]+)\] (.+)$/) &&
      !trimmedLine.includes(" RAW: ") &&
      !trimmedLine.includes(" user: ") &&
      !trimmedLine.includes(" goose: ");

    let chatMatch = null;
    let sender = null;
    let content = null;
    let msgSessionId = null;

    if (standardMatch) {
      [, msgSessionId, sender, content] = standardMatch;
      chatMatch = true;
    } else if (rawMatch) {
      [, msgSessionId, content] = rawMatch;
      sender = "goose"; // RAW messages are from goose
      chatMatch = true;
    } else if (directMatch && !isSystemMessage(trimmedLine)) {
      [, msgSessionId, content] = directMatch;
      sender = "goose"; // Direct messages are from goose
      chatMatch = true;
    }

    // NEW: Handle RAW messages that don't have session ID prefix
    // This handles the actual format we're seeing: just the message content with ANSI codes
    if (!chatMatch && trimmedLine && !isSystemMessage(trimmedLine)) {
      // If this line contains actual content and isn't a system message,
      // treat it as a goose response for the current session
      const cleanContent = cleanMessageContent(trimmedLine);
      console.log(
        `[${sessionId}] DEBUG: Checking line for chat content: "${trimmedLine}"`
      );
      console.log(
        `[${sessionId}] DEBUG: Clean content: "${cleanContent}" (length: ${cleanContent.length})`
      );
      console.log(
        `[${sessionId}] DEBUG: Is system message: ${isSystemMessage(
          trimmedLine
        )}`
      );

      if (cleanContent.trim() && cleanContent.length > 3) {
        // Accept any meaningful message (lowered threshold from 10 to 3)
        result.chatMessages.push({
          sender: "goose",
          content: cleanContent,
          timestamp: new Date(),
          isClean: true,
        });
        result.shouldDisplay = true;

        // DEBUG: Log successful message parsing
        console.log(
          `[${sessionId}] DEBUG: Successfully parsed goose message (no prefix): "${cleanContent.substring(
            0,
            50
          )}..."`
        );
        chatMatch = true; // Prevent further processing
      } else {
        console.log(`[${sessionId}] DEBUG: Rejected line - too short or empty`);
      }
    }

    if (chatMatch && msgSessionId === sessionId) {
      const cleanContent = cleanMessageContent(content);

      if (cleanContent.trim()) {
        result.chatMessages.push({
          sender,
          content: cleanContent,
          timestamp: new Date(),
          isClean: true,
        });
        result.shouldDisplay = true;

        // DEBUG: Log successful message parsing
        console.log(
          `[${sessionId}] DEBUG: Successfully parsed ${sender} message: "${cleanContent.substring(
            0,
            50
          )}..."`
        );
      }
    } else if (!chatMatch && isSystemMessage(trimmedLine)) {
      result.systemLogs.push(trimmedLine);
    }
  }

  return result;
}

function cleanMessageContent(content) {
  return (
    content
      // Remove ANSI escape codes (more comprehensive pattern)
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/\[38;2;[0-9;]*m/g, "")
      .replace(/\[1;38;2;[0-9;]*m/g, "")
      .replace(/\[0m/g, "")
      // Remove extra whitespace
      .replace(/\s+/g, " ")
      // Remove session IDs and timestamps that might be embedded
      .replace(/\[[a-f0-9]{24}\]/g, "")
      // Clean up any remaining artifacts
      .trim()
  );
}

function isSystemMessage(line) {
  const systemPatterns = [
    /^starting session \|/,
    /^logging to /,
    /^working directory:/,
    /^Context: [○●]+/,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*WARN/,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*INFO/,
    /^Goose is running!/,
    /^G❯/,
    /WARN mcp_client/,
    /Failed to parse incoming message/,
    /Successfully installed/,
    /Collecting /,
    /Downloading /,
    /Installing collected packages/,
    /WARNING: Defaulting repo_id/,
    /Download and installation successful/,
    /You can now load the package/,
    /speech_mcp\.server/,
    /Kokoro TTS/,
    // Additional MCP-related patterns
    /mcp_client.*WARN/,
    /mcp_client.*ERROR/,
    /mcp_client.*INFO/,
    /Failed to parse incoming message from MCP/,
    /MCP server.*disconnected/,
    /MCP server.*connected/,
    /Invalid MCP message/,
    /MCP protocol error/,
    // System status messages
    /^Session.*started/,
    /^Session.*ended/,
    /^Process.*exited/,
    /^Spawning.*process/,
    // Stack trace patterns
    /^\s*at\s+/,
    /crates\/mcp-client\/src/,
    /\.rs:\d+$/,
    // Empty or whitespace-only lines
    /^\s*$/,
  ];

  return systemPatterns.some((pattern) => pattern.test(line));
}

// Function to clean existing messages in database (run once)
const cleanExistingMessages = async () => {
  try {
    const messages = await Message.find({});
    let cleanedCount = 0;
    let deletedCount = 0;

    for (const message of messages) {
      const cleanedText = cleanMessageContent(message.text);

      // If cleaned text is empty or just whitespace, delete the message
      if (!cleanedText || !cleanedText.trim()) {
        await Message.findByIdAndDelete(message._id);
        deletedCount++;
        console.log(`Deleted empty message: ${message._id}`);
        continue;
      }

      // Only update if text actually changed and is not empty
      if (cleanedText !== message.text && cleanedText.trim()) {
        message.text = cleanedText;
        await message.save();
        cleanedCount++;
      }
    }

    if (cleanedCount > 0 || deletedCount > 0) {
      console.log(
        `Cleaned ${cleanedCount} and deleted ${deletedCount} existing messages in database`
      );
    }
  } catch (error) {
    console.error("Error cleaning existing messages:", error);
  }
};

// Enhanced handle Goose output function with filtering
const handleGooseOutput = async (sessionId, data, sender = "goose") => {
  try {
    const rawText = data.toString();

    // Always log to console for debugging (keep system logs visible in terminal)
    console.log(`[${sessionId}] RAW: ${rawText.trim()}`);

    // DEBUG: Add detailed logging to diagnose parsing issues
    console.log(
      `[${sessionId}] DEBUG: Parsing with sessionId: ${sessionId.toString()}`
    );
    console.log(
      `[${sessionId}] DEBUG: Raw text lines:`,
      rawText.split("\n").map((line) => `"${line.trim()}"`)
    );

    // Parse and filter the output
    const parsed = parseGooseOutput(rawText, sessionId.toString());

    // DEBUG: Log parsing results
    console.log(`[${sessionId}] DEBUG: Parsed result:`, {
      chatMessages: parsed.chatMessages.length,
      systemLogs: parsed.systemLogs.length,
      shouldDisplay: parsed.shouldDisplay,
    });

    // Log system messages to console but don't save to database
    if (parsed.systemLogs.length > 0) {
      parsed.systemLogs.forEach((log) => {
        console.log(`[${sessionId}] SYSTEM: ${log}`);
      });
    }

    // Only process and save actual chat messages
    for (const chatMessage of parsed.chatMessages) {
      // Prevent duplicate user messages (they're already saved when sent)
      if (chatMessage.sender === "user") {
        // Skip saving user messages here as they're saved in the API endpoint
        console.log(
          `[${sessionId}] USER (skipped duplicate): ${chatMessage.content}`
        );
        continue;
      }

      // Validate message content before saving
      if (!chatMessage.content || !chatMessage.content.trim()) {
        console.log(
          `[${sessionId}] SKIPPED: Empty ${chatMessage.sender} message`
        );
        continue;
      }

      // Save AI messages to database
      const message = new Message({
        sessionId,
        sender: chatMessage.sender,
        text: chatMessage.content.trim(), // Ensure no leading/trailing whitespace
        timestamp: chatMessage.timestamp,
      });

      try {
        await message.save();
        console.log(
          `[${sessionId}] SAVED: ${chatMessage.sender} message to database`
        );
      } catch (saveError) {
        console.error(`[${sessionId}] ERROR saving message:`, saveError);
        continue; // Skip broadcasting if save failed
      }

      // Broadcast message via WebSocket
      broadcastMessage({
        type: "message",
        sessionId,
        sender: chatMessage.sender,
        text: chatMessage.content,
        timestamp: message.timestamp,
      });

      console.log(
        `[${sessionId}] ${chatMessage.sender}: ${chatMessage.content}`
      );
    }

    // Check if Goose prompt is detected to update session status
    if (rawText.includes("G❯") || rawText.includes("Goose is running!")) {
      const session = await Session.findById(sessionId);
      if (session && session.status !== "running") {
        session.status = "running";
        await session.save();

        // Broadcast status update
        broadcastMessage({
          type: "status_update",
          sessionId,
          status: "running",
        });
      }
    }
  } catch (error) {
    console.error("Error handling Goose output:", error);
  }
};

// Start Goose session function
const startGooseSession = async (sessionName) => {
  try {
    // Create new session in MongoDB
    const session = new Session({
      name: sessionName,
      status: "waiting",
      startedAt: new Date(),
    });
    await session.save();

    console.log(`Starting Goose session: ${sessionName} (ID: ${session._id})`);

    // Spawn Goose CLI process
    const args = ["session"];
    if (sessionName) {
      args.push("--name", sessionName);
    }

    const gooseProcess = spawn("goose", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    // Store process in map
    processMap.set(session._id.toString(), {
      process: gooseProcess,
      session: session,
      status: "waiting",
    });

    // Handle stdout data from Goose
    gooseProcess.stdout.on("data", (data) => {
      handleGooseOutput(session._id, data, "goose");
    });

    // Handle stderr data from Goose
    gooseProcess.stderr.on("data", (data) => {
      handleGooseOutput(session._id, data, "goose");
    });

    // Handle process exit
    gooseProcess.on("close", async (code) => {
      console.log(
        `Goose process for session ${session._id} exited with code ${code}`
      );

      try {
        // Update session status to completed
        const updatedSession = await Session.findById(session._id);
        if (updatedSession) {
          updatedSession.status = "completed";
          await updatedSession.save();

          // Broadcast status update
          broadcastMessage({
            type: "status_update",
            sessionId: session._id,
            status: "completed",
          });
        }

        // Remove from process map
        processMap.delete(session._id.toString());
      } catch (error) {
        console.error("Error updating session on process close:", error);
      }
    });

    // Handle process error
    gooseProcess.on("error", (error) => {
      console.error(
        `Error starting Goose process for session ${session._id}:`,
        error
      );
      processMap.delete(session._id.toString());
    });

    return session;
  } catch (error) {
    console.error("Error starting Goose session:", error);
    throw error;
  }
};

// Static file serving for dashboard.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Wingman: Goose Orchestrator is running",
    activeSessions: processMap.size,
    connectedClients: wsClients.size,
  });
});

// API Endpoints

// POST /sessions - Create new Goose session
app.post("/sessions", authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Session name is required" });
    }

    const session = await startGooseSession(name);
    res.status(201).json({
      id: session._id,
      name: session.name,
      status: session.status,
      startedAt: session.startedAt,
    });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// GET /sessions - List all sessions
app.get("/sessions", authenticateToken, async (req, res) => {
  try {
    const sessions = await Session.find().sort({ startedAt: -1 });
    res.json(
      sessions.map((session) => ({
        id: session._id,
        name: session.name,
        status: session.status,
        startedAt: session.startedAt,
      }))
    );
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// POST /sessions/:id/prompts - Send prompt to specific session
app.post("/sessions/:id/prompts", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const processInfo = processMap.get(id);
    if (!processInfo) {
      return res
        .status(404)
        .json({ error: "Session not found or not running" });
    }

    // Save user message to database ONLY HERE (not in handleGooseOutput)
    const userMessage = new Message({
      sessionId: id,
      sender: "user",
      text: prompt.trim(),
      timestamp: new Date(),
    });
    await userMessage.save();

    // Broadcast user message via WebSocket
    broadcastMessage({
      type: "message",
      sessionId: id,
      sender: "user",
      text: prompt.trim(),
      timestamp: userMessage.timestamp,
    });

    // Send prompt to Goose process
    processInfo.process.stdin.write(prompt + "\n");

    console.log(`[${id}] USER: ${prompt.trim()}`);
    res.json({ message: "Prompt sent successfully" });
  } catch (error) {
    console.error("Error sending prompt:", error);
    res.status(500).json({ error: "Failed to send prompt" });
  }
});

// POST /sessions/:id/stop - Stop a running session
app.post("/sessions/:id/stop", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const processInfo = processMap.get(id);
    if (!processInfo) {
      return res
        .status(404)
        .json({ error: "Session not found or not running" });
    }

    // Kill the process
    processInfo.process.kill("SIGTERM");

    // Update session status
    const session = await Session.findById(id);
    if (session) {
      session.status = "completed";
      await session.save();
    }

    // Remove from process map
    processMap.delete(id);

    // Broadcast status update
    broadcastMessage({
      type: "status_update",
      sessionId: id,
      status: "completed",
    });

    res.json({ message: "Session stopped successfully" });
  } catch (error) {
    console.error("Error stopping session:", error);
    res.status(500).json({ error: "Failed to stop session" });
  }
});

// POST /sessions/:id/resume - Resume a previous session
app.post("/sessions/:id/resume", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if session exists
    const session = await Session.findById(id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Check if already running
    if (processMap.has(id)) {
      return res.status(400).json({ error: "Session is already running" });
    }

    // Start new Goose process for this session
    const gooseProcess = spawn("goose", ["session", "resume", session.name], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    // Store process in map
    processMap.set(id, {
      process: gooseProcess,
      session: session,
      status: "running",
    });

    // Update session status
    session.status = "running";
    await session.save();

    // Handle stdout data from Goose
    gooseProcess.stdout.on("data", (data) => {
      handleGooseOutput(id, data, "goose");
    });

    // Handle stderr data from Goose
    gooseProcess.stderr.on("data", (data) => {
      handleGooseOutput(id, data, "goose");
    });

    // Handle process exit
    gooseProcess.on("close", async (code) => {
      console.log(
        `Resumed Goose process for session ${id} exited with code ${code}`
      );

      try {
        const updatedSession = await Session.findById(id);
        if (updatedSession) {
          updatedSession.status = "completed";
          await updatedSession.save();

          broadcastMessage({
            type: "status_update",
            sessionId: id,
            status: "completed",
          });
        }

        processMap.delete(id);
      } catch (error) {
        console.error(
          "Error updating resumed session on process close:",
          error
        );
      }
    });

    // Handle process error
    gooseProcess.on("error", (error) => {
      console.error(`Error resuming Goose process for session ${id}:`, error);
      processMap.delete(id);
    });

    // Broadcast status update
    broadcastMessage({
      type: "status_update",
      sessionId: id,
      status: "running",
    });

    res.json({ message: "Session resumed successfully" });
  } catch (error) {
    console.error("Error resuming session:", error);
    res.status(500).json({ error: "Failed to resume session" });
  }
});

// GET /sessions/:id/messages - Get messages for a session (chat history)
app.get("/sessions/:id/messages", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify session exists
    const session = await Session.findById(id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Get messages for this session
    const messages = await Message.find({ sessionId: id }).sort({
      timestamp: 1,
    });

    res.json(
      messages.map((msg) => ({
        id: msg._id,
        sender: msg.sender,
        text: cleanMessageContent(msg.text), // Clean messages when retrieving
        timestamp: msg.timestamp,
      }))
    );
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Handle 404 for API routes
app.use("/sessions", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Wingman: Goose Orchestrator running on port ${PORT}`);
  console.log(`WebSocket server ready for real-time communication`);
  console.log(`API Token: ${API_TOKEN}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");

  // Close all running Goose processes
  for (const [sessionId, processInfo] of processMap) {
    console.log(`Terminating Goose process for session ${sessionId}`);
    processInfo.process.kill("SIGTERM");
  }

  // Close WebSocket server
  wss.close();

  // Close HTTP server
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

module.exports = app;
