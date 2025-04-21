/**
 * Discord Auto-Forwarder v0.1.0
 * 
 * Aplikasi untuk meneruskan pesan dari channel Discord ke webhook Discord lainnya
 * 
 * @copyright 2025 Benss
 * @author .naban (Discord)
 */

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride(function (req, res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    // look in urlencoded POST bodies and delete it
    const method = req.body._method;
    delete req.body._method;
    return method;
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database');
    
    // Create tables if they don't exist
    db.run(`CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token TEXT NOT NULL,
      is_active INTEGER DEFAULT 0
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      webhook_url TEXT NOT NULL,
      is_forwarding INTEGER DEFAULT 0,
      FOREIGN KEY (server_id) REFERENCES servers (id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      server_id TEXT NOT NULL,
      server_name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      FOREIGN KEY (server_id) REFERENCES servers (id),
      FOREIGN KEY (channel_id) REFERENCES channels (id)
    )`);
  }
});

// Discord clients map (token -> client)
const discordClients = new Map();

// Load the ClientUserSettingManager class to patch
try {
  // Monkey patch to fix the ClientUserSettingManager issue with null friend_source_flags
  const { ClientUserSettingManager } = require('discord.js-selfbot-v13');
  
  // Check if the class exists and has the _patch method before attempting to patch
  if (ClientUserSettingManager && ClientUserSettingManager.prototype && ClientUserSettingManager.prototype._patch) {
    const originalPatch = ClientUserSettingManager.prototype._patch;
    
    // Override the _patch method to handle null friend_source_flags
    ClientUserSettingManager.prototype._patch = function(data) {
      // Add a defensive check for friend_source_flags
      if (!data.friend_source_flags) {
        data.friend_source_flags = { 
          all: false,
          mutual_friends: false,
          mutual_guilds: false
        };
      }
      return originalPatch.call(this, data);
    };
    console.log("Successfully patched ClientUserSettingManager to handle null friend_source_flags");
  } else {
    console.warn("Could not patch ClientUserSettingManager - class structure may have changed");
  }
} catch (error) {
  console.error("Error while patching ClientUserSettingManager:", error.message);
  // Continue execution even if patching fails
}

// Connect to Discord with a token
async function connectToDiscord(serverId, token) {
  try {
    // Check if client already exists
    if (discordClients.has(token)) {
      console.log(`Client already connected for server ${serverId}`);
      return true;
    }
    
    const client = new Client({
      checkUpdate: false,
      autoRedeemNitro: false,
      captchaService: null,
      patchVoice: false
    });
    
    // Handle unhandled promise rejections in the client
    client.on('error', (error) => {
      console.error(`Client error for server ${serverId}:`, error);
    });

    // Add enhanced error handling for client events
    process.on('unhandledRejection', (reason, promise) => {
      console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't crash the application, just log the error
    });
    
    // Login
    await client.login(token);
    
    client.on('ready', () => {
      console.log(`Logged in as ${client.user.tag} for server ${serverId}`);
      
      // Update server as active in database
      db.run('UPDATE servers SET is_active = 1 WHERE id = ?', [serverId], (err) => {
        if (err) {
          console.error('Error updating server status:', err.message);
        }
      });
    });
    
    // Message event handler
    client.on('messageCreate', async (message) => {
      // Get list of channels to forward for this server
      db.all(
        'SELECT * FROM channels WHERE server_id = ? AND is_forwarding = 1',
        [serverId],
        async (err, channels) => {
          if (err) {
            console.error('Error fetching channels:', err.message);
            return;
          }
          
          // Check if message channel is in our forwarding list
          const forwardChannel = channels.find(ch => ch.id === message.channel.id);
          if (!forwardChannel) return;
          
          // Hanya filter pesan bot, bukan webhook atau pengguna dengan tag APP
          // Don't forward bot messages (but allow webhooks) or messages without content and attachments
          if ((message.author.bot && !message.webhookId) || (!message.content && !message.attachments.size)) return;
          
          try {
            // Log the message for debugging
            console.log(`Processing message from ${message.author.username} (Webhook: ${message.webhookId ? 'Yes' : 'No'})`);
            console.log(`Message content: ${message.content}`);
            
            // Create webhook payload
            const webhookData = {
              username: message.author.username,
              avatar_url: message.author.displayAvatarURL(),
              content: message.content || " " // Tambahkan spasi jika tidak ada konten untuk menghindari error empty message
            };
            
            // Jika ini dari webhook, tambahkan indikator di username (opsional)
            if (message.webhookId) {
              // Kita bisa menandai bahwa ini dari webhook, tapi simpan username aslinya
              // webhookData.username = `${webhookData.username} [Webhook]`;
            }
            
            // Ekstrak tag APP dari konten pesan jika ada
            const appTagMatch = message.content.match(/APP/);
            if (appTagMatch) {
              // Kita tetap meneruskan pesan dengan tag APP tanpa modifikasi
              console.log("Found APP tag in message");
            }
            
            // Jika ada attachment, tambahkan embeds untuk gambar
            if (message.attachments.size > 0) {
              webhookData.embeds = [];
              
              message.attachments.forEach(attachment => {
                // Hanya tambahkan gambar ke embeds
                if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                  webhookData.embeds.push({
                    image: {
                      url: attachment.url
                    }
                  });
                } else {
                  // Tambahkan URL file jika bukan gambar
                  if (webhookData.content === " ") {
                    webhookData.content = `${attachment.name}: ${attachment.url}`;
                  } else {
                    webhookData.content += `\n${attachment.name}: ${attachment.url}`;
                  }
                }
              });
            }
            
            // Send to webhook
            await axios.post(forwardChannel.webhook_url, webhookData);
            
            // Log success
            db.run(
              `INSERT INTO logs (timestamp, server_id, server_name, channel_id, channel_name, author, content, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                new Date().toISOString(),
                serverId,
                client.user.tag,
                message.channel.id,
                message.channel.name,
                message.author.tag + (message.webhookId ? ' [Webhook]' : ''),
                (message.content.substring(0, 100) + (message.content.length > 100 ? '...' : '')) +
                (message.attachments.size > 0 ? ` [+${message.attachments.size} attachment(s)]` : ''),
                'success'
              ]
            );
          } catch (error) {
            console.error('Error forwarding message:', error);
            
            // Log error
            db.run(
              `INSERT INTO logs (timestamp, server_id, server_name, channel_id, channel_name, author, content, status, error_message) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                new Date().toISOString(),
                serverId,
                client.user.tag,
                message.channel.id,
                message.channel.name,
                message.author.tag + (message.webhookId ? ' [Webhook]' : ''),
                (message.content.substring(0, 100) + (message.content.length > 100 ? '...' : '')) +
                (message.attachments.size > 0 ? ` [+${message.attachments.size} attachment(s)]` : ''),
                'error',
                error.message
              ]
            );
          }
        }
      );
    });
    
    // Store client instance
    discordClients.set(token, client);
    return true;
  } catch (error) {
    console.error(`Error connecting to Discord for server ${serverId}:`, error);
    
    // Log connection error
    db.run(
      `INSERT INTO logs (timestamp, server_id, server_name, channel_id, channel_name, author, content, status, error_message) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        new Date().toISOString(),
        serverId,
        'Unknown',
        'N/A',
        'N/A',
        'System',
        'Failed to connect to Discord',
        'error',
        error.message
      ]
    );
    
    return false;
  }
}

// Disconnect from Discord
function disconnectFromDiscord(serverId, token) {
  try {
    const client = discordClients.get(token);
    if (client) {
      client.destroy();
      discordClients.delete(token);
      
      // Update server as inactive in database
      db.run('UPDATE servers SET is_active = 0 WHERE id = ?', [serverId], (err) => {
        if (err) {
          console.error('Error updating server status:', err.message);
        }
      });
      
      console.log(`Disconnected from Discord for server ${serverId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error disconnecting from Discord for server ${serverId}:`, error);
    return false;
  }
}

// Routes
app.get('/', (req, res) => {
  // Get all servers
  db.all('SELECT * FROM servers', [], (err, servers) => {
    if (err) {
      console.error('Error fetching servers:', err.message);
      return res.status(500).json({ error: 'Error fetching servers' });
    }
    
    // Get all active channels
    db.all(`
      SELECT c.*, s.name AS server_name 
      FROM channels c
      JOIN servers s ON c.server_id = s.id
      WHERE c.is_forwarding = 1
    `, [], (err, activeChannels) => {
      if (err) {
        console.error('Error fetching active channels:', err.message);
        return res.status(500).json({ error: 'Error fetching active channels' });
      }
      
      const connectedCount = servers.filter(s => s.is_active).length;
      const totalCount = servers.length;
      
      res.render('dashboard', { 
        servers, 
        connectedCount,
        totalCount,
        activeChannels: activeChannels.length
      });
    });
  });
});

app.get('/servers', (req, res) => {
  db.all('SELECT * FROM servers', [], (err, servers) => {
    if (err) {
      console.error('Error fetching servers:', err.message);
      return res.status(500).json({ error: 'Error fetching servers' });
    }
    
    res.render('servers', { servers });
  });
});

app.post('/servers', (req, res) => {
  const { name, token } = req.body;
  
  if (!name || !token) {
    return res.status(400).json({ error: 'Name and token are required' });
  }
  
  const client = new Client({
    checkUpdate: false,
    autoRedeemNitro: false,
    captchaService: null
  });
  
  // Validate token by attempting to login
  client.login(token)
    .then(() => {
      const id = client.user.id;
      const serverId = id;
      
      // Insert server into database
      db.run(
        'INSERT INTO servers (id, name, token, is_active) VALUES (?, ?, ?, 0)',
        [serverId, name, token],
        function(err) {
          client.destroy(); // Logout after validation
          
          if (err) {
            console.error('Error adding server:', err.message);
            return res.status(500).json({ error: 'Error adding server' });
          }
          
          // Redirect to servers page
          res.redirect('/servers');
        }
      );
    })
    .catch(error => {
      console.error('Error validating token:', error);
      res.render('servers', { 
        error: 'Invalid Discord token', 
        servers: [] 
      });
    });
});

app.post('/servers/:id/connect', (req, res) => {
  const serverId = req.params.id;
  
  db.get('SELECT * FROM servers WHERE id = ?', [serverId], async (err, server) => {
    if (err) {
      console.error('Error fetching server:', err.message);
      return res.status(500).json({ error: 'Error fetching server' });
    }
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    
    const success = await connectToDiscord(serverId, server.token);
    
    if (success) {
      res.redirect('/servers');
    } else {
      res.render('servers', { 
        error: 'Failed to connect to Discord server', 
        servers: [] 
      });
    }
  });
});

app.post('/servers/:id/disconnect', (req, res) => {
  const serverId = req.params.id;
  
  db.get('SELECT * FROM servers WHERE id = ?', [serverId], (err, server) => {
    if (err) {
      console.error('Error fetching server:', err.message);
      return res.status(500).json({ error: 'Error fetching server' });
    }
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    
    const success = disconnectFromDiscord(serverId, server.token);
    
    if (success) {
      res.redirect('/servers');
    } else {
      res.render('servers', { 
        error: 'Failed to disconnect from Discord server', 
        servers: [] 
      });
    }
  });
});

app.delete('/servers/:id', (req, res) => {
  const serverId = req.params.id;
  
  db.get('SELECT * FROM servers WHERE id = ?', [serverId], (err, server) => {
    if (err) {
      console.error('Error fetching server:', err.message);
      return res.status(500).json({ error: 'Error fetching server' });
    }
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    
    // Disconnect if connected
    if (server.is_active) {
      disconnectFromDiscord(serverId, server.token);
    }
    
    // Delete associated channels
    db.run('DELETE FROM channels WHERE server_id = ?', [serverId], (err) => {
      if (err) {
        console.error('Error deleting channels:', err.message);
        return res.status(500).json({ error: 'Error deleting channels' });
      }
      
      // Delete server
      db.run('DELETE FROM servers WHERE id = ?', [serverId], (err) => {
        if (err) {
          console.error('Error deleting server:', err.message);
          return res.status(500).json({ error: 'Error deleting server' });
        }
        
        res.redirect('/servers');
      });
    });
  });
});

app.get('/channels', (req, res) => {
  const filteredServerId = req.query.server || null;
  
  let channelsQuery = `
    SELECT c.*, s.name AS server_name 
    FROM channels c
    JOIN servers s ON c.server_id = s.id
  `;
  
  let queryParams = [];
  
  if (filteredServerId) {
    channelsQuery += ` WHERE c.server_id = ?`;
    queryParams.push(filteredServerId);
  }
  
  db.all(channelsQuery, queryParams, (err, channels) => {
    if (err) {
      console.error('Error fetching channels:', err.message);
      return res.status(500).json({ error: 'Error fetching channels' });
    }
    
    // Get active servers for channel setup
    db.all('SELECT * FROM servers WHERE is_active = 1', [], (err, servers) => {
      if (err) {
        console.error('Error fetching servers:', err.message);
        return res.status(500).json({ error: 'Error fetching servers' });
      }
      
      res.render('channels', { 
        channels, 
        servers,
        filteredServerId 
      });
    });
  });
});

app.post('/channels', (req, res) => {
  const { server_id, channel_id, webhook_url } = req.body;
  
  if (!server_id || !channel_id || !webhook_url) {
    return res.status(400).json({ error: 'Server ID, channel ID, and webhook URL are required' });
  }
  
  // Validate server exists and is active
  db.get('SELECT * FROM servers WHERE id = ? AND is_active = 1', [server_id], (err, server) => {
    if (err || !server) {
      return res.render('channels', { 
        error: 'Server not found or not connected',
        channels: [],
        servers: []
      });
    }
    
    // Get Discord client
    const client = discordClients.get(server.token);
    if (!client) {
      return res.render('channels', { 
        error: 'Discord client not found',
        channels: [],
        servers: []
      });
    }
    
    // Validate channel exists
    const channel = client.channels.cache.get(channel_id);
    if (!channel) {
      return res.render('channels', { 
        error: 'Channel not found',
        channels: [],
        servers: []
      });
    }
    
    // Validate webhook URL
    try {
      new URL(webhook_url);
    } catch (e) {
      return res.render('channels', { 
        error: 'Invalid webhook URL',
        channels: [],
        servers: []
      });
    }
    
    // Insert channel into database
    db.run(
      'INSERT INTO channels (id, server_id, name, webhook_url, is_forwarding) VALUES (?, ?, ?, ?, 0)',
      [channel_id, server_id, channel.name, webhook_url],
      function(err) {
        if (err) {
          console.error('Error adding channel:', err.message);
          return res.render('channels', { 
            error: 'Error adding channel',
            channels: [],
            servers: []
          });
        }
        
        res.redirect(`/channels?server=${server_id}`);
      }
    );
  });
});

app.post('/channels/:id/toggle', (req, res) => {
  const channelId = req.params.id;
  
  db.get('SELECT * FROM channels WHERE id = ?', [channelId], (err, channel) => {
    if (err) {
      console.error('Error fetching channel:', err.message);
      return res.status(500).json({ error: 'Error fetching channel' });
    }
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    const newStatus = channel.is_forwarding ? 0 : 1;
    
    db.run(
      'UPDATE channels SET is_forwarding = ? WHERE id = ?',
      [newStatus, channelId],
      function(err) {
        if (err) {
          console.error('Error updating channel status:', err.message);
          return res.status(500).json({ error: 'Error updating channel status' });
        }
        
        res.redirect('/channels');
      }
    );
  });
});

app.post('/channels/:id/delete', (req, res) => {
  const channelId = req.params.id;
  
  // Get the channel first to get the server_id for redirecting
  db.get('SELECT * FROM channels WHERE id = ?', [channelId], (err, channel) => {
    if (err) {
      console.error('Error fetching channel:', err.message);
      return res.status(500).json({ error: 'Error fetching channel' });
    }
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    const serverId = channel.server_id;
    
    db.run('DELETE FROM channels WHERE id = ?', [channelId], function(err) {
      if (err) {
        console.error('Error deleting channel:', err.message);
        return res.status(500).json({ error: 'Error deleting channel' });
      }
      
      res.redirect(`/channels?server=${serverId}`);
    });
  });
});

app.get('/logs', (req, res) => {
  // Get the most recent 100 logs
  db.all(
    'SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100',
    [],
    (err, logs) => {
      if (err) {
        console.error('Error fetching logs:', err.message);
        return res.status(500).json({ error: 'Error fetching logs' });
      }
      
      // Get connection status for all servers
      db.all('SELECT * FROM servers', [], (err, servers) => {
        if (err) {
          console.error('Error fetching servers:', err.message);
          return res.status(500).json({ error: 'Error fetching servers' });
        }
        
        const connectedCount = servers.filter(s => s.is_active).length;
        const totalCount = servers.length;
        const isConnected = connectedCount > 0;
        
        res.render('logs', { 
          logs, 
          connectedCount,
          totalCount,
          isConnected,
          error: null,
          success: null
        });
      });
    }
  );
});

// Start reconnecting any active servers on startup
db.all('SELECT * FROM servers WHERE is_active = 1', [], (err, servers) => {
  if (err) {
    console.error('Error fetching active servers:', err.message);
    return;
  }
  
  console.log(`Attempting to reconnect ${servers.length} active servers...`);
  
  servers.forEach(server => {
    connectToDiscord(server.id, server.token)
      .then(success => {
        console.log(`Reconnection for server ${server.id} ${success ? 'successful' : 'failed'}`);
      });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 