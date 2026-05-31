const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8000;

// Serve static files from the current directory
app.use(express.static(__dirname));

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
