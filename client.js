const { io } = require('socket.io-client');

const socket = io('http://localhost:3001/auction', {
    // transports: ['websocket'], // Force WebSocket, skip long-polling
  tryAllTransports: true,

  });

socket.on('connect', () => {
  console.log('Connected to WebSocket /auction namespace');

  socket.emit('joinAuction', { auctionId: 'abc123' });

  socket.on('joinedAuction', (data) => {
    console.log('Joined Auction:', data);
  });
});

socket.on('connect_error', (err) => {
  console.error('Connection Error:', err.message);
});
