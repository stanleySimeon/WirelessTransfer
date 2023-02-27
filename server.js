const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');
const path = require('path');
const mdns = require('mdns');

const browser = mdns.createBrowser(mdns.tcp('http'));

browser.on('serviceUp', service => {
  console.log('Service up:', service.name, service.addresses);
});

browser.on('serviceDown', service => {
  console.log('Service down:', service.name, service.addresses);
});

browser.start();

const PORT = process.env.PORT || 5500;

// Serve the index.html file
app.get('/', (req, res) => {
  req.socket.setNoDelay(true);
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve static files from the "/public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Listen for socket connections
io.on('connection', socket => {
  console.log('A user connected:', socket.id);

  // Send a list of available peers to all clients
  const peers = Object.keys(io.sockets.sockets)
    .filter(id => id !== socket.id);
  io.emit('peers', peers);

  // Handle incoming connections
  socket.on('peer', peer => {
    console.log('Peer connection:', socket.id, peer);

    // Send a list of available peers to the new peer
    const peers = Object.keys(io.sockets.sockets)
      .filter(id => id !== socket.id && id !== peer);
    io.to(peer).emit('peers', peers);
  });

  // Handle incoming file transfers
  socket.on('send file', (data, peer) => {
    const peerSocket = io.sockets.sockets[peer];

    // Check if the peer socket exists
    if (!peerSocket) {
      console.error(`Peer ${peer} not found`);
      return;
    }

    // Write the file to disk
    const filename = path.join(__dirname, 'uploads', data.filename);
    fs.writeFile(filename, data.data, err => {
      if (err) {
        console.error(`Error writing file ${filename}: ${err}`);
        return;
      }

      // Send a confirmation message to the sender
      socket.emit('file sent', {
        filename: data.filename,
        size: data.data.byteLength
      });

      // Send the file to the peer
      fs.readFile(filename, (err, fileData) => {
        if (err) {
          console.error(`Error reading file ${filename}: ${err}`);
          return;
        }

        peerSocket.emit('file received', {
          filename: data.filename,
          data: fileData
        });
      });
    });
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });

});

// Start the server
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

process.on('SIGINT', () => {
  browser.stop();
  process.exit();
});
