const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serveren gemmer KUN andre spilleres positioner (ikke din egen)
const players = {};

io.on('connection', (socket) => {
    console.log(`Spiller tilsluttet: ${socket.id}`);
    
    // Gem spillerens seneste data
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 700 + 50,
        y: 440,
        health: 100,
        facingRight: true,
        isAttacking: false,
        isBlocking: false,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        alive: true
    };
    
    // Send liste over ALLE andre spillere til den nye spiller
    const otherPlayers = {};
    Object.keys(players).forEach(id => {
        if (id !== socket.id) {
            otherPlayers[id] = players[id];
        }
    });
    socket.emit('existingPlayers', otherPlayers);
    
    // Broadcast ny spiller til alle andre
    socket.broadcast.emit('newPlayer', players[socket.id]);
    
    // Modtag position fra klient (kun broadcast til andre)
    socket.on('updatePosition', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].facingRight = data.facingRight;
            players[socket.id].isAttacking = data.isAttacking;
            players[socket.id].isBlocking = data.isBlocking;
            players[socket.id].health = data.health;
            players[socket.id].alive = data.alive;
        }
        
        // Send opdatering til ALLE ANDRE (ikke afsenderen)
        socket.broadcast.emit('playerUpdate', players[socket.id]);
    });
    
    // Når en spiller angriber, tjekker vi hit detection på serveren
    socket.on('attackEvent', (attackData) => {
        // Broadcast attack animation til andre
        socket.broadcast.emit('playerAttack', {
            attackerId: socket.id,
            attackX: attackData.attackX,
            attackY: attackData.attackY,
            attackWidth: attackData.attackWidth,
            attackHeight: attackData.attackHeight,
            direction: attackData.direction
        });
    });
    
    // Når en spiller blokerer, informer andre
    socket.on('blockingState', (isBlocking) => {
        if (players[socket.id]) {
            players[socket.id].isBlocking = isBlocking;
        }
        socket.broadcast.emit('playerBlocking', {
            playerId: socket.id,
            isBlocking: isBlocking
        });
    });
    
    // Når en spiller tager skade (informeret af den angribende klient)
    socket.on('playerHit', (data) => {
        // Den angribende klient fortæller serveren at target blev ramt
        socket.broadcast.emit('playerWasHit', {
            attackerId: socket.id,
            targetId: data.targetId,
            damage: data.damage,
            hitX: data.hitX,
            hitY: data.hitY,
            blocked: data.blocked
        });
    });
    
    // Spiller død
    socket.on('playerDeath', (data) => {
        if (players[socket.id]) {
            players[socket.id].alive = false;
            players[socket.id].health = 0;
        }
        socket.broadcast.emit('playerDied', {
            playerId: socket.id,
            killerId: data.killerId
        });
    });
    
    // Spiller respawn
    socket.on('playerRespawn', (data) => {
        if (players[socket.id]) {
            players[socket.id].alive = true;
            players[socket.id].health = 100;
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
        }
        socket.broadcast.emit('playerRespawned', players[socket.id]);
    });
    
    socket.on('disconnect', () => {
        console.log(`Spiller afbrudt: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server kører på port ${PORT}`);
    console.log(`Åbn http://localhost:${PORT} i din browser`);
});
