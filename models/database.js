const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Create database directory if it doesn't exist
const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(path.join(dbDir, 'database.sqlite'));

// Initialize database
function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Create servers table
            db.run(`CREATE TABLE IF NOT EXISTS servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id TEXT UNIQUE NOT NULL,
                server_name TEXT NOT NULL
            )`);

            // Create channels table
            db.run(`CREATE TABLE IF NOT EXISTS channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                channel_name TEXT NOT NULL,
                webhook_url TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                UNIQUE(channel_id, webhook_url)
            )`);

            // Create settings table
            db.run(`CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                discord_token TEXT,
                last_connected DATETIME
            )`);

            // Create messages table for logging
            db.run(`CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                server_id TEXT NOT NULL,
                author TEXT NOT NULL,
                content TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                forwarded BOOLEAN DEFAULT 0,
                webhook_url TEXT,
                error TEXT
            )`, (err) => {
                if (err) {
                    console.error('Error creating tables:', err);
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    });
}

// Server functions
async function addServer(serverId, serverName) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO servers (server_id, server_name) VALUES (?, ?)',
            [serverId, serverName],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            }
        );
    });
}

async function getServers() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM servers ORDER BY server_name', (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

// Channel functions
async function addChannel(serverId, channelId, channelName, webhookUrl) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO channels (server_id, channel_id, channel_name, webhook_url) VALUES (?, ?, ?, ?)',
            [serverId, channelId, channelName, webhookUrl],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            }
        );
    });
}

async function getChannels(serverId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM channels WHERE server_id = ? ORDER BY channel_name',
            [serverId],
            (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            }
        );
    });
}

async function getAllChannels() {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT c.*, s.server_name 
             FROM channels c
             JOIN servers s ON c.server_id = s.server_id
             WHERE c.is_active = 1
             ORDER BY s.server_name, c.channel_name`,
            (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            }
        );
    });
}

async function toggleChannel(channelId, active) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE channels SET is_active = ? WHERE channel_id = ?',
            [active ? 1 : 0, channelId],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes > 0);
            }
        );
    });
}

async function deleteChannel(channelId, webhookUrl) {
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM channels WHERE channel_id = ? AND webhook_url = ?',
            [channelId, webhookUrl],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes > 0);
            }
        );
    });
}

// Settings functions
async function getSettings() {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM settings WHERE id = 1', (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row || { id: 1, discord_token: null, last_connected: null });
        });
    });
}

async function updateSettings(discordToken) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO settings (id, discord_token, last_connected) 
             VALUES (1, ?, CURRENT_TIMESTAMP)`,
            [discordToken],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            }
        );
    });
}

// Message logging functions
async function logMessage(messageId, channelId, serverId, author, content, forwarded = false, webhookUrl = null, error = null) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO messages (message_id, channel_id, server_id, author, content, forwarded, webhook_url, error)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [messageId, channelId, serverId, author, content, forwarded ? 1 : 0, webhookUrl, error],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            }
        );
    });
}

async function getRecentLogs(limit = 100) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT m.*, c.channel_name, s.server_name 
             FROM messages m
             LEFT JOIN channels c ON m.channel_id = c.channel_id
             LEFT JOIN servers s ON m.server_id = s.server_id
             ORDER BY m.timestamp DESC LIMIT ?`,
            [limit],
            (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            }
        );
    });
}

// Server maintenance
async function cleanupInaccessibleServers(currentServerIds) {
    return new Promise((resolve, reject) => {
        const placeholders = currentServerIds.map(() => '?').join(',');
        const query = currentServerIds.length > 0 
            ? `DELETE FROM servers WHERE server_id NOT IN (${placeholders})`
            : 'DELETE FROM servers';
            
        db.run(query, currentServerIds, function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve(this.changes);
        });
    });
}

async function cleanupOrphanedChannels() {
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM channels 
             WHERE server_id NOT IN (SELECT server_id FROM servers)`,
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes);
            }
        );
    });
}

module.exports = {
    initDatabase,
    addServer,
    getServers,
    addChannel,
    getChannels,
    getAllChannels,
    toggleChannel,
    deleteChannel,
    getSettings,
    updateSettings,
    logMessage,
    getRecentLogs,
    cleanupInaccessibleServers,
    cleanupOrphanedChannels
}; 