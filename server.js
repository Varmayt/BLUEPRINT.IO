const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8000;

// Parse JSON bodies (increased limit to handle large XML/PNG diagram uploads)
app.use(express.json({ limit: '50mb' }));

// Serve static files from the current directory
app.use(express.static(__dirname));

// Cache available model per API key to avoid querying it every time
const keyModelCache = new Map();

async function getBestModelForKey(apiKey) {
  if (keyModelCache.has(apiKey)) {
    return keyModelCache.get(apiKey);
  }
  
  const defaultModel = 'gemini-1.5-flash';
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.models)) {
        const modelNames = data.models.map(m => m.name.replace('models/', ''));
        
        // List of models in order of preference
        const preferenceList = [
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
          'gemini-1.5-pro',
          'gemini-1.0-pro'
        ];
        
        for (const pref of preferenceList) {
          if (modelNames.includes(pref)) {
            keyModelCache.set(apiKey, pref);
            return pref;
          }
        }
        
        // Fallback to first available model that supports generateContent
        const supportedModel = data.models.find(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
        if (supportedModel) {
          const name = supportedModel.name.replace('models/', '');
          keyModelCache.set(apiKey, name);
          return name;
        }
      }
    }
  } catch (e) {
    console.error('Error querying models list:', e);
  }
  
  return defaultModel;
}

// Gemini API Proxy
app.post('/api/gemini-proxy', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || req.headers['x-gemini-key'] || req.body.apiKey;
  if (!apiKey) {
    return res.status(400).json({ error: { message: 'Gemini API key is required. Please add your key in configuration.' } });
  }

  const { contents } = req.body;
  try {
    const model = await getBestModelForKey(apiKey);
    console.log(`Routing API request using model: ${model}`);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });
    
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    console.error('Gemini proxy error:', err);
    res.status(500).json({ error: { message: err.message || 'Internal Server Error' } });
  }
});

// GitHub API Proxy
app.post('/api/github-proxy', async (req, res) => {
  const { url, method, headers, body } = req.body;
  try {
    const response = await fetch(url, {
      method: method || 'GET',
      headers: headers || {},
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('GitHub proxy error:', err);
    res.status(500).json({ error: { message: err.message || 'Internal Server Error' } });
  }
});

// Get list of diagrams in workspace root
app.get('/api/list-diagrams', (req, res) => {
  try {
    const files = fs.readdirSync(__dirname);
    const diagramFiles = files.filter(f => f.startsWith('diagram_') && f.endsWith('.xml'));
    
    // Sort files by number if possible, e.g., diagram_1.xml, diagram_2.xml
    diagramFiles.sort((a, b) => {
      const numA = parseInt(a.replace(/diagram_(\d+)\.xml/, '$1')) || 0;
      const numB = parseInt(b.replace(/diagram_(\d+)\.xml/, '$1')) || 0;
      return numA - numB;
    });

    const diagrams = diagramFiles.map(filename => {
      const xml = fs.readFileSync(path.join(__dirname, filename), 'utf8');
      const id = filename.replace('.xml', '');
      // Friendly name, e.g., "diagram_1" -> "Diagram 1", or "diagram_context" -> "Diagram Context"
      const namePart = id.replace('diagram_', '');
      const name = isNaN(namePart) 
        ? namePart.charAt(0).toUpperCase() + namePart.slice(1) 
        : `Diagram ${namePart}`;
      return { id, name, filename, xml };
    });

    res.json(diagrams);
  } catch (err) {
    console.error('Error listing diagrams:', err);
    res.status(500).json({ error: 'Failed to list diagrams' });
  }
});

// Save diagram file
app.post('/api/save-diagram', (req, res) => {
  const { filename, xml } = req.body;
  if (!filename || typeof xml !== 'string') {
    return res.status(400).json({ error: 'Filename and XML content are required' });
  }

  // Security: only allow files like diagram_*.xml in the workspace root
  const filenameRegex = /^diagram_\w+\.xml$/;
  if (!filenameRegex.test(filename)) {
    return res.status(400).json({ error: 'Invalid diagram filename' });
  }

  try {
    fs.writeFileSync(path.join(__dirname, filename), xml, 'utf8');
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving diagram:', err);
    res.status(500).json({ error: 'Failed to save diagram' });
  }
});

// Delete diagram file
app.delete('/api/delete-diagram', (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const filenameRegex = /^diagram_\w+\.xml$/;
  if (!filenameRegex.test(filename)) {
    return res.status(400).json({ error: 'Invalid diagram filename' });
  }

  try {
    const filePath = path.join(__dirname, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting diagram:', err);
    res.status(500).json({ error: 'Failed to delete diagram' });
  }
});

// Serve index.html for any room route to support direct room link sharing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Room states store (in-memory)
// Keys: roomId, Values: { xml: '', prompt: '', history: [], users: Set }
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);

    // If room doesn't exist, initialize it
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        xml: '',
        prompt: '',
        history: [],
        users: new Set()
      });
    }

    const roomState = rooms.get(roomId);
    roomState.users.add(socket.id);

    // Send the current room state to the newly joined user
    socket.emit('room-state', {
      xml: roomState.xml,
      prompt: roomState.prompt,
      history: roomState.history
    });

    // Notify others in the room
    socket.to(roomId).emit('user-joined', { userId: socket.id, count: roomState.users.size });
  });

  socket.on('diagram-update', ({ roomId, xml, level, prompt }) => {
    const roomState = rooms.get(roomId);
    if (roomState) {
      roomState.xml = xml;
      if (prompt) roomState.prompt = prompt;
      // Broadcast update to others in the room
      socket.to(roomId).emit('diagram-update', { xml, level, prompt });
    }
  });

  socket.on('chat-message', ({ roomId, text, sender }) => {
    const roomState = rooms.get(roomId);
    if (roomState) {
      const msg = { text, sender, timestamp: new Date() };
      roomState.history.push(msg);
      // Limit history to last 50 messages
      if (roomState.history.length > 50) {
        roomState.history.shift();
      }
      // Broadcast message to others in the room
      socket.to(roomId).emit('chat-message', msg);
    }
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      const roomState = rooms.get(roomId);
      if (roomState) {
        roomState.users.delete(socket.id);
        socket.to(roomId).emit('user-left', { userId: socket.id, count: roomState.users.size });
        // Clean up empty rooms after some time or immediately
        if (roomState.users.size === 0) {
          rooms.delete(roomId);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Blueprint.io Server running on port ${PORT}`);
});
