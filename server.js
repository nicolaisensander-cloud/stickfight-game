const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname)));

const players = {};
const ATTACK_DAMAGE = 10;
const BLOCK_KNOCKBACK = 200;
const PLAYER_SPEED = 5;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_Y = 500;
const PLAYER_WIDTH = 30;
const PLAYER_HEIGHT = 60;
const ATTACK_RANGE = 60;
const ATTACK_COOLDOWN = 500;
const BLOCK_COOLDOWN = 800;
const MAX_HEALTH = 100;

io.on('connection', (socket) => {
    console.log(`Spiller tilsluttet: ${socket.id}`);
    
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 700 + 50,
        y: GROUND_Y - PLAYER_HEIGHT,
        vx: 0,
        vy: 0,
        health: MAX_HEALTH,
        facingRight: true,
        isAttacking: false,
        isBlocking: false,
        lastAttack: 0,
        lastBlock: 0,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        onGround: false,
        alive: true
    };
    
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);
    
    socket.on('playerMovement', (movementData) => {
        const player = players[socket.id];
        if (!player || !player.alive) return;
        
        player.facingRight = movementData.facingRight;
        
        if (movementData.left) {
            player.vx = -PLAYER_SPEED;
        } else if (movementData.right) {
            player.vx = PLAYER_SPEED;
        } else {
            player.vx = 0;
        }
        
        if (movementData.jump && player.onGround) {
            player.vy = JUMP_FORCE;
            player.onGround = false;
        }
    });
    
    socket.on('playerAttack', () => {
        const player = players[socket.id];
        if (!player || !player.alive) return;
        
        const now = Date.now();
        if (now - player.lastAttack < ATTACK_COOLDOWN) return;
        
        player.lastAttack = now;
        player.isAttacking = true;
        
        Object.keys(players).forEach(targetId => {
            if (targetId === socket.id) return;
            const target = players[targetId];
            if (!target || !target.alive) return;
            
            const playerCenterX = player.x + PLAYER_WIDTH / 2;
            const targetCenterX = target.x + PLAYER_WIDTH / 2;
            const distance = Math.abs(playerCenterX - targetCenterX);
            const verticalDistance = Math.abs((player.y + PLAYER_HEIGHT / 2) - (target.y + PLAYER_HEIGHT / 2));
            
            const attackDirection = player.facingRight ? 1 : -1;
            const targetDirection = playerCenterX < targetCenterX ? 1 : -1;
            
            if (distance < ATTACK_RANGE && verticalDistance < PLAYER_HEIGHT && attackDirection === targetDirection) {
                if (target.isBlocking) {
                    const knockbackX = player.facingRight ? -BLOCK_KNOCKBACK : BLOCK_KNOCKBACK;
                    player.vx += knockbackX * 0.5;
                    player.vy = -8;
                    target.vx += (player.facingRight ? BLOCK_KNOCKBACK * 0.3 : -BLOCK_KNOCKBACK * 0.3);
                    
                    io.emit('blockEffect', {
                        attackerId: socket.id,
                        blockerId: targetId,
                        blockX: (player.x + target.x) / 2,
                        blockY: (player.y + target.y) / 2
                    });
                } else {
                    target.health -= ATTACK_DAMAGE;
                    target.vx += (player.facingRight ? 5 : -5);
                    target.vy = -5;
                    
                    io.emit('hitEffect', {
                        attackerId: socket.id,
                        targetId: targetId,
                        damage: ATTACK_DAMAGE
                    });
                    
                    if (target.health <= 0) {
                        target.alive = false;
                        target.health = 0;
                        io.emit('playerDied', targetId);
                        
                        setTimeout(() => {
                            if (players[targetId]) {
                                players[targetId].x = Math.random() * 700 + 50;
                                players[targetId].y = GROUND_Y - PLAYER_HEIGHT;
                                players[targetId].vx = 0;
                                players[targetId].vy = 0;
                                players[targetId].health = MAX_HEALTH;
                                players[targetId].alive = true;
                                io.emit('playerRespawned', players[targetId]);
                            }
                        }, 3000);
                    }
                }
            }
        });
        
        setTimeout(() => {
            if (player) player.isAttacking = false;
        }, 200);
        
        io.emit('attackAnimation', socket.id);
    });
    
    socket.on('playerBlock', (isBlocking) => {
        const player = players[socket.id];
        if (!player || !player.alive) return;
        
        if (isBlocking) {
            const now = Date.now();
            if (now - player.lastBlock < BLOCK_COOLDOWN) return;
            player.lastBlock = now;
        }
        
        player.isBlocking = isBlocking;
        io.emit('blockState', { playerId: socket.id, isBlocking });
    });
    
    socket.on('disconnect', () => {
        console.log(`Spiller afbrudt: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

function gameLoop() {
    Object.keys(players).forEach(id => {
        const player = players[id];
        if (!player) return;
        
        player.vy += GRAVITY;
        player.x += player.vx;
        player.y += player.vy;
        
        if (player.y >= GROUND_Y - PLAYER_HEIGHT) {
            player.y = GROUND_Y - PLAYER_HEIGHT;
            player.vy = 0;
            player.onGround = true;
        }
        
        if (player.x < 0) {
            player.x = 0;
            player.vx = 0;
        }
        if (player.x > 800 - PLAYER_WIDTH) {
            player.x = 800 - PLAYER_WIDTH;
            player.vx = 0;
        }
        
        if (player.y < 0) {
            player.y = 0;
            player.vy = 0;
        }
        
        if (player.onGround) {
            player.vx *= 0.9;
        } else {
            player.vx *= 0.99;
        }
    });
    
    io.emit('gameState', players);
}

setInterval(gameLoop, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server kører på port ${PORT}`);
});
