// Wingman: Goose Orchestrator System
// Complete backend server implementation (Prisma + SQLite)

const express = require("express");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

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
    if (process.env.NODE_ENV === "development") {
      console.log(`[${sessionId}] DEBUG: Processing line: "${trimmedLine}"`);
    }

    // Check for session-specific chat message patterns (24-hex id)
    const standardMatch = trimmedLine.match(
      /^\[([a-f0-9]{24})\] (user|goose): (.+)$/
    );
    const rawMatch = trimmedLine.match(/^\[([a-f0-9]{24})\] RAW: (.+)$/);
    const directMatch =
      trimmedLine.match(/^\[([a-f0-9]{24})\] (.+)$/) &&
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
      [, msgSessionId, content] = trimmedLine.match(/^\[([a-f0-9]{24})\] (.+)$/);
      sender = "goose"; // Direct messages are from goose
      chatMatch = true;
    }

    // Fallback: treat meaningful non-system lines as goose output for the session
    if (!chatMatch && trimmedLine && !isSystemMessage(trimmedLine)) {
      const cleanContent = cleanMessageContent(trimmedLine);
      if (cleanContent.trim() && cleanContent.length > 3) {
        result.chatMessages.push({
          sender: "goose",
          content: cleanContent,
          timestamp: new Date(),
          isClean: true,
        });
        result.shouldDisplay = true;
        chatMatch = true;
      }
    }

    if (chatMatch && msgSessionId === sessionId) {
      const cleanContent = cleanMessageContent(content);
      if (cleanContent && cleanContent.trim()) {
        result.chatMessages.push({
          sender,
          content: cleanContent,
          timestamp: new Date(),
          isClean: true,
        });
        result.shouldDisplay = true;
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
      // Remove ANSI escape codes
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/\[38;2;[0-9;]*m/g, "")
      .replace(/\[1;38;2;[0-9;]*m/g, "")
      .replace(/\[0m/g, "")
      // Remove extra whitespace
      .replace(/\s+/g, " ")
      // Remove embedded 24-hex IDs
      .replace(/\[[a-f0-9]{24}\]/g, "")
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
    /\/bin\/sh: goose: command not found/,
    /Successfully installed/,
    /Collecting /,
    /Downloading /,
    /Installing collected packages/,
    /WARNING: Defaulting repo_id/,
    /Download and installation successful/,
    /You can now load the package/,
    /speech_mcp\.server/,
    /Kokoro TTS/,
    /mcp_client.*WARN/,
    /mcp_client.*ERROR/,
    /mcp_client.*INFO/,
    /Failed to parse incoming message from MCP/,
    /MCP server.*disconnected/,
    /MCP server.*connected/,
    /Invalid MCP message/,
    /MCP protocol error/,
    /^Session.*started/,
    /^Session.*ended/,
    /^Process.*exited/,
    /^Spawning.*process/,
    /^\s*at\s+/,
    /crates\/mcp-client\/src/,
    /\.rs:\d+$/,
    /^\s*$/,
  ];

  return systemPatterns.some((pattern) => pattern.test(line));
}

// Enhanced handle Goose output function with filtering (uses Prisma)
const handleGooseOutput = async (sessionId, data, sender = "goose") => {
  try {
    const rawText = data.toString();

    console.log(`[${sessionId}] RAW: ${rawText.trim()}`);

    const parsed = parseGooseOutput(rawText, sessionId.toString());

    if (parsed.systemLogs.length > 0) {
      parsed.systemLogs.forEach((log) => {
        console.log(`[${sessionId}] SYSTEM: ${log}`);
      });
    }

    for (const chatMessage of parsed.chatMessages) {
      if (chatMessage.sender === "user") {
        console.log(`[${sessionId}] USER (skipped duplicate): ${chatMessage.content}`);
        continue;
      }

      if (!chatMessage.content || !chatMessage.content.trim()) {
        console.log(`[${sessionId}] SKIPPED: Empty ${chatMessage.sender} message`);
        continue;
      }

      try {
        const saved = await prisma.message.create({
          data: {
            id: undefined, // let Prisma generate cuid by default
            sessionId: sessionId,
            sender: "goose",
            text: chatMessage.content.trim(),
            timestamp: chatMessage.timestamp,
          },
        });

        broadcastMessage({
          type: "message",
          sessionId,
          sender: "goose",
          text: chatMessage.content,
          timestamp: saved.timestamp,
        });

        console.log(`[${sessionId}] goose: ${chatMessage.content}`);
      } catch (saveError) {
        console.error(`[${sessionId}] ERROR saving message:`, saveError);
      }
    }

    // Update session status to running if prompt detected
    if (rawText.includes("G❯") || rawText.includes("Goose is running!")) {
      try {
        await prisma.session.update({
          where: { id: sessionId.toString() },
          data: { status: "running" },
        });
        broadcastMessage({ type: "status_update", sessionId, status: "running" });
      } catch (e) {
        // It may fail if session not found; ignore
      }
    }
  } catch (error) {
    console.error("Error handling Goose output:", error);
  }
};

// Start Goose session function (uses Prisma)
const startGooseSession = async (sessionName) => {
  try {
    const sessionId = require("crypto").randomBytes(12).toString("hex"); // 24-hex to match existing regex

    const session = await prisma.session.create({
      data: {
        id: sessionId,
        name: sessionName,
        status: "waiting",
        startedAt: new Date(),
      },
    });

    console.log(`Starting Goose session: ${sessionName} (ID: ${session.id})`);

    const args = ["session"]; 
    if (sessionName) {
      args.push("--name", sessionName);
    }

    const gooseProcess = spawn("goose", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    processMap.set(session.id.toString(), {
      process: gooseProcess,
      session: session,
      status: "waiting",
    });

    gooseProcess.stdout.on("data", (data) => {
      handleGooseOutput(session.id, data, "goose");
    });

    gooseProcess.stderr.on("data", (data) => {
      handleGooseOutput(session.id, data, "goose");
    });

    gooseProcess.on("close", async (code) => {
      console.log(`Goose process for session ${session.id} exited with code ${code}`);

      try {
        await prisma.session.update({ where: { id: session.id }, data: { status: "completed" } });
        broadcastMessage({ type: "status_update", sessionId: session.id, status: "completed" });
        processMap.delete(session.id.toString());
      } catch (error) {
        console.error("Error updating session on process close:", error);
      }
    });

    gooseProcess.on("error", (error) => {
      console.error(`Error starting Goose process for session ${session.id}:`, error);
      processMap.delete(session.id.toString());
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

// Health check endpoint (includes DB check)
app.get("/health", async (req, res) => {
  try {
    await prisma.session.count();
    res.json({
      status: "OK",
      message: "Wingman: Goose Orchestrator is running",
      db: "ok",
      activeSessions: processMap.size,
      connectedClients: wsClients.size,
    });
  } catch (e) {
    res.status(500).json({ status: "ERROR", message: "DB not reachable" });
  }
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
      id: session.id,
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
    const sessions = await prisma.session.findMany({ orderBy: { startedAt: "desc" } });
    res.json(
      sessions.map((session) => ({
        id: session.id,
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
      return res.status(404).json({ error: "Session not found or not running" });
    }

    const userMessage = await prisma.message.create({
      data: {
        sessionId: id,
        sender: "user",
        text: prompt.trim(),
        timestamp: new Date(),
      },
    });

    broadcastMessage({
      type: "message",
      sessionId: id,
      sender: "user",
      text: prompt.trim(),
      timestamp: userMessage.timestamp,
    });

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
      return res.status(404).json({ error: "Session not found or not running" });
    }

    processInfo.process.kill("SIGTERM");

    try {
      await prisma.session.update({ where: { id }, data: { status: "completed" } });
    } catch {}

    processMap.delete(id);

    broadcastMessage({ type: "status_update", sessionId: id, status: "completed" });

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

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (processMap.has(id)) {
      return res.status(400).json({ error: "Session is already running" });
    }

    const gooseProcess = spawn("goose", ["session", "resume", session.name], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    processMap.set(id, { process: gooseProcess, session, status: "running" });

    await prisma.session.update({ where: { id }, data: { status: "running" } });

    gooseProcess.stdout.on("data", (data) => {
      handleGooseOutput(id, data, "goose");
    });

    gooseProcess.stderr.on("data", (data) => {
      handleGooseOutput(id, data, "goose");
    });

    gooseProcess.on("close", async (code) => {
      console.log(`Resumed Goose process for session ${id} exited with code ${code}`);

      try {
        await prisma.session.update({ where: { id }, data: { status: "completed" } });
        broadcastMessage({ type: "status_update", sessionId: id, status: "completed" });
        processMap.delete(id);
      } catch (error) {
        console.error("Error updating resumed session on process close:", error);
      }
    });

    gooseProcess.on("error", (error) => {
      console.error(`Error resuming Goose process for session ${id}:`, error);
      processMap.delete(id);
    });

    broadcastMessage({ type: "status_update", sessionId: id, status: "running" });

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

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const messages = await prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { timestamp: "asc" },
    });

    res.json(
      messages.map((msg) => ({
        id: msg.id,
        sender: msg.sender,
        text: cleanMessageContent(msg.text),
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
server.listen(PORT, async () => {
  if (process.env.NODE_ENV !== "development" && API_TOKEN === "default-token") {
    console.warn("Warning: Using default API token outside development.");
  }
  console.log(`Wingman: Goose Orchestrator running on port ${PORT}`);
  console.log(`WebSocket server ready for real-time communication`);
  console.log(`API Token: ${API_TOKEN}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");

  for (const [sessionId, processInfo] of processMap) {
    console.log(`Terminating Goose process for session ${sessionId}`);
    processInfo.process.kill("SIGTERM");
  }

  wss.close();

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
    console.log("Server closed");
    process.exit(0);
  });
});

module.exports = app;
