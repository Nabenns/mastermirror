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
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

// Configure Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security & Performance Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com"],
      fontSrc: ["'self'", "cdn.jsdelivr.net", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "cdn.discordapp.com"],
    },
  },
}));
app.use(compression());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

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
const db = new sqlite3.Database(
  path.join(__dirname, 'data', 'database.sqlite'),
  (err) => {
    if (err) {
      logger.error(`Error opening database: ${err.message}`);
    } else {
      logger.info('Connected to the SQLite database');

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

      // Migrations for Advanced Features
      const migrations = [
        "ALTER TABLE channels ADD COLUMN filter_keywords TEXT",
        "ALTER TABLE channels ADD COLUMN filter_blacklist TEXT",
        "ALTER TABLE channels ADD COLUMN user_whitelist TEXT",
        "ALTER TABLE channels ADD COLUMN user_blacklist TEXT",
        "ALTER TABLE channels ADD COLUMN embed_config TEXT",
        "ALTER TABLE channels ADD COLUMN delay_min INTEGER DEFAULT 0",
        "ALTER TABLE channels ADD COLUMN delay_max INTEGER DEFAULT 0"
      ];

      migrations.forEach(query => {
        db.run(query, (err) => {
          // Ignore error if column already exists
          if (err && !err.message.includes('duplicate column name')) {
            console.warn('Migration warning:', err.message);
          }
        });
      });

      db.run(`CREATE TABLE IF NOT EXISTS channel_webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        webhook_url TEXT NOT NULL,
        name TEXT,
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
    ClientUserSettingManager.prototype._patch = function (data) {
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

          // Don't forward messages without content, attachments, or embeds
          if (!message.content && !message.attachments.size && !message.embeds.length) return;

          // --- FILTERING LOGIC ---

          // 1. User Whitelist/Blacklist
          if (forwardChannel.user_whitelist) {
            const whitelist = forwardChannel.user_whitelist.split(',').map(id => id.trim());
            if (whitelist.length > 0 && !whitelist.includes(message.author.id)) {
              console.log(`Skipping message from ${message.author.username}: Not in whitelist`);
              return;
            }
          }

          if (forwardChannel.user_blacklist) {
            const blacklist = forwardChannel.user_blacklist.split(',').map(id => id.trim());
            if (blacklist.includes(message.author.id)) {
              console.log(`Skipping message from ${message.author.username}: In blacklist`);
              return;
            }
          }

          // 2. Keyword Filtering
          if (message.content) {
            if (forwardChannel.filter_keywords) {
              const keywords = forwardChannel.filter_keywords.split(',').map(k => k.trim().toLowerCase());
              const contentLower = message.content.toLowerCase();
              // If keywords exist, message MUST contain at least one (Allow list behavior)
              // Or we could implement Block list behavior. Let's assume Allow list for "filter_keywords"
              // But usually users want "Block words". Let's check implementation plan.
              // Plan said "Filter messages by keywords (allow/block)". 
              // Let's implement "filter_keywords" as REQUIRED words (Allow list) if present.
              // And "filter_blacklist" as BLOCKED words.

              const hasKeyword = keywords.some(k => contentLower.includes(k));
              if (keywords.length > 0 && !hasKeyword) {
                console.log(`Skipping message: Missing required keyword`);
                return;
              }
            }

            if (forwardChannel.filter_blacklist) {
              const blacklistWords = forwardChannel.filter_blacklist.split(',').map(k => k.trim().toLowerCase());
              const contentLower = message.content.toLowerCase();
              const hasBlacklisted = blacklistWords.some(k => contentLower.includes(k));
              if (hasBlacklisted) {
                console.log(`Skipping message: Contains blacklisted keyword`);
                return;
              }
            }
          }

          try {
            console.log(`Processing message from ${message.author.username}`);

            // Prepare Webhook Data
            let webhookData = {
              username: message.author.username,
              avatar_url: message.author.displayAvatarURL(),
              content: message.content || " "
            };

            // --- EMBED BUILDER LOGIC ---
            if (forwardChannel.embed_config) {
              try {
                const embedConfig = JSON.parse(forwardChannel.embed_config);
                // If custom embed is enabled, we might wrap the content in an embed
                // Or just modify the existing payload. 
                // Let's assume we want to wrap plain text in an embed if configured.
                if (embedConfig.enabled) {
                  const embed = {
                    description: message.content,
                    color: parseInt(embedConfig.color.replace('#', ''), 16) || 0x5865F2,
                    footer: { text: embedConfig.footer || `Forwarded from ${message.guild.name}` },
                    timestamp: new Date().toISOString(),
                    author: {
                      name: message.author.username,
                      icon_url: message.author.displayAvatarURL()
                    }
                  };

                  if (!webhookData.embeds) webhookData.embeds = [];
                  webhookData.embeds.push(embed);
                  webhookData.content = ""; // Clear content if moving to embed
                }
              } catch (e) {
                console.error("Error parsing embed config:", e);
              }
            }

            // Handle Attachments (same as before)
            if (message.attachments.size > 0) {
              // If we are using custom embed, add images to it or as separate embeds
              // For simplicity, keep existing logic but adapt for custom embeds
              if (!webhookData.embeds) {
                // Standard behavior
                message.attachments.forEach(attachment => {
                  if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                    if (webhookData.content === " ") webhookData.content = attachment.url;
                    else webhookData.content += `\n${attachment.url}`;
                  } else {
                    if (webhookData.content === " ") webhookData.content = `${attachment.name}: ${attachment.url}`;
                    else webhookData.content += `\n${attachment.name}: ${attachment.url}`;
                  }
                });
              } else {
                // If using embeds, add images as image embeds
                message.attachments.forEach(attachment => {
                  if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                    webhookData.embeds.push({
                      image: { url: attachment.url }
                    });
                  } else {
                    // Non-image attachments go to content
                    webhookData.content += `\n${attachment.name}: ${attachment.url}`;
                  }
                });
              }
            }

            // Handle existing embeds from the message
            if (message.embeds.length > 0) {
              if (!webhookData.embeds) webhookData.embeds = [];
              message.embeds.forEach(embed => webhookData.embeds.push(embed));
            }

            // --- DELAY LOGIC ---
            let delay = 0;
            if (forwardChannel.delay_max > 0) {
              const min = forwardChannel.delay_min || 0;
              const max = forwardChannel.delay_max;
              delay = Math.floor(Math.random() * (max - min + 1)) + min;
            }

            const sendToWebhook = async (url) => {
              await new Promise(resolve => setTimeout(resolve, delay * 1000));
              await axios.post(url, webhookData);
            };

            // --- MULTI-DESTINATION LOGIC ---
            // 1. Send to primary webhook
            sendToWebhook(forwardChannel.webhook_url);

            // 2. Fetch and send to extra webhooks
            db.all('SELECT webhook_url FROM channel_webhooks WHERE channel_id = ?', [forwardChannel.id], (err, extraWebhooks) => {
              if (!err && extraWebhooks) {
                extraWebhooks.forEach(ew => sendToWebhook(ew.webhook_url));
              }
            });

            // Log success (only once for the primary)
            let logContent = message.content || '';
            logContent = logContent.substring(0, 1000);

            db.run(
              `INSERT INTO logs (timestamp, server_id, server_name, channel_id, channel_name, author, content, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                new Date().toISOString(),
                serverId,
                client.user.tag,
                message.channel.id,
                message.channel.name,
                message.author.tag,
                logContent,
                'success'
              ]
            );

          } catch (error) {
            console.error('Error forwarding message:', error);
            // Log error logic (kept simple)
            db.run(
              `INSERT INTO logs (timestamp, server_id, server_name, channel_id, channel_name, author, content, status, error_message) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                new Date().toISOString(),
                serverId,
                client.user.tag,
                message.channel.id,
                message.channel.name,
                message.author.tag,
                message.content ? message.content.substring(0, 1000) : '',
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

app.get('/servers/:id/edit', (req, res) => {
  const serverId = req.params.id;
  db.get('SELECT * FROM servers WHERE id = ?', [serverId], (err, server) => {
    if (err) {
      console.error('Error fetching server:', err.message);
      return res.status(500).send('Error fetching server');
    }
    if (!server) {
      return res.status(404).send('Server not found');
    }
    res.render('edit-token', { server });
  });
});

app.post('/servers/:id/edit', (req, res) => {
  const serverId = req.params.id;
  const { token } = req.body;
  if (!token) {
    return res.status(400).send('Token is required');
  }
  db.get('SELECT * FROM servers WHERE id = ?', [serverId], async (err, server) => {
    if (err) {
      console.error('Error fetching server:', err.message);
      return res.status(500).send('Error fetching server');
    }
    if (!server) {
      return res.status(404).send('Server not found');
    }
    try {
      // Validate new token by login
      const client = new Client({
        checkUpdate: false,
        autoRedeemNitro: false,
        captchaService: null
      });
      await client.login(token);
      const newId = client.user.id;
      if (newId !== serverId) {
        client.destroy();
        return res.status(400).send('Token does not match server ID');
      }
      client.destroy();

      // Update token in DB
      db.run('UPDATE servers SET token = ? WHERE id = ?', [token, serverId], async (err) => {
        if (err) {
          console.error('Error updating token:', err.message);
          return res.status(500).send('Error updating token');
        }
        // If server is active, disconnect old client and connect with new token
        if (server.is_active) {
          disconnectFromDiscord(serverId, server.token);
          await connectToDiscord(serverId, token);
        }
        res.redirect('/servers');
      });
    } catch (error) {
      console.error('Error validating token:', error);
      res.status(400).send('Invalid token');
    }
  });
});

// Routes
app.get('/', (req, res) => {
  // Get all servers
  db.all('SELECT * FROM servers', [], (err, servers) => {
    if (err) {
      console.error('Error fetching servers:', err.message);
      return res.status(500).json({ error: 'Error fetching servers' });
    }

    // Get all channels
    db.all('SELECT * FROM channels', [], (err, allChannels) => {
      if (err) {
        console.error('Error fetching channels:', err.message);
        return res.status(500).json({ error: 'Error fetching channels' });
      }

      // Get all extra webhooks
      db.all('SELECT * FROM channel_webhooks', [], (err, allWebhooks) => {
        if (err) {
          console.error('Error fetching webhooks:', err.message);
          return res.status(500).json({ error: 'Error fetching webhooks' });
        }

        // Group webhooks by channel_id
        const webhooksByChannel = {};
        allWebhooks.forEach(wh => {
          if (!webhooksByChannel[wh.channel_id]) {
            webhooksByChannel[wh.channel_id] = [];
          }
          webhooksByChannel[wh.channel_id].push(wh);
        });

        // Group channels by server_id and attach webhooks
        const channelsByServer = {};
        allChannels.forEach(channel => {
          // Attach extra webhooks
          channel.extra_webhooks = webhooksByChannel[channel.id] || [];

          // Rename for compatibility with view if needed, or just use raw names
          // View expects: channel_name, channel_id, is_active (mapped from is_forwarding)
          channel.channel_name = channel.name;
          channel.channel_id = channel.id;
          channel.is_active = channel.is_forwarding;

          if (!channelsByServer[channel.server_id]) {
            channelsByServer[channel.server_id] = [];
          }
          channelsByServer[channel.server_id].push(channel);
        });

        // Map servers to include server_name
        const serversWithNames = servers.map(s => ({
          ...s,
          server_name: s.name,
          server_id: s.id
        }));

        const connectedCount = servers.filter(s => s.is_active).length;
        const totalCount = servers.length;
        const activeChannelsCount = allChannels.filter(c => c.is_forwarding).length;

        res.render('index', {
          servers: serversWithNames,
          channels: channelsByServer,
          connectedCount,
          totalCount,
          activeChannels: activeChannelsCount,
          isConnected: discordClients.size > 0,
          error: req.query.error || null,
          success: req.query.success || null
        });
      });
    });
  });
});


app.post('/settings', (req, res) => {
  const { discordToken } = req.body;

  if (!discordToken) {
    return res.render('index', {
      servers: [],
      connectedCount: 0,
      totalCount: 0,
      activeChannels: 0,
      isConnected: false,
      error: 'Token is required',
      success: null
    });
  }

  const client = new Client({
    checkUpdate: false,
    autoRedeemNitro: false,
    captchaService: null
  });

  client.login(discordToken)
    .then(() => {
      const id = client.user.id;
      const name = client.user.username;

      // Check if server exists
      db.get('SELECT * FROM servers WHERE id = ?', [id], (err, row) => {
        if (err) {
          client.destroy();
          console.error('Error checking server:', err.message);
          return res.render('index', {
            servers: [],
            connectedCount: 0,
            totalCount: 0,
            activeChannels: 0,
            isConnected: false,
            error: 'Database error',
            success: null
          });
        }

        if (row) {
          // Update existing server
          db.run('UPDATE servers SET token = ?, name = ? WHERE id = ?', [discordToken, name, id], (err) => {
            client.destroy();
            if (err) {
              console.error('Error updating server:', err.message);
              return res.redirect('/?error=' + encodeURIComponent('Error updating server'));
            }
            res.redirect('/?success=' + encodeURIComponent('Server updated successfully'));
          });
        } else {
          // Insert new server
          db.run('INSERT INTO servers (id, name, token, is_active) VALUES (?, ?, ?, 0)', [id, name, discordToken], (err) => {
            client.destroy();
            if (err) {
              console.error('Error adding server:', err.message);
              return res.redirect('/?error=' + encodeURIComponent('Error adding server'));
            }
            res.redirect('/?success=' + encodeURIComponent('Server added successfully'));
          });
        }
      });
    })
    .catch(error => {
      console.error('Error validating token:', error);
      // We need to fetch data again to render index properly, or just redirect with error
      res.redirect('/?error=' + encodeURIComponent('Invalid Discord token'));
    });
});

app.get('/servers', (req, res) => {
  db.all('SELECT * FROM servers', [], (err, servers) => {
    if (err) {
      console.error('Error fetching servers:', err.message);
      return res.status(500).json({ error: 'Error fetching servers' });
    }

    res.render('servers', { servers, isConnected: discordClients.size > 0, error: null, success: null });
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
        function (err) {
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
        servers: [],
        isConnected: discordClients.size > 0
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
        servers: [],
        isConnected: discordClients.size > 0
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
        servers: [],
        isConnected: discordClients.size > 0
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
        filteredServerId,
        isConnected: discordClients.size > 0,
        error: null,
        success: null
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
        servers: [],
        isConnected: discordClients.size > 0
      });
    }

    // Get Discord client
    const client = discordClients.get(server.token);
    if (!client) {
      return res.render('channels', {
        error: 'Discord client not found',
        channels: [],
        servers: [],
        isConnected: discordClients.size > 0
      });
    }

    // Validate channel exists
    const channel = client.channels.cache.get(channel_id);
    if (!channel) {
      return res.render('channels', {
        error: 'Channel not found',
        channels: [],
        servers: [],
        isConnected: discordClients.size > 0
      });
    }

    // Validate webhook URL
    try {
      new URL(webhook_url);
    } catch (e) {
      return res.render('channels', {
        error: 'Invalid webhook URL',
        channels: [],
        servers: [],
        isConnected: discordClients.size > 0
      });
    }

    // Insert channel into database
    db.run(
      'INSERT INTO channels (id, server_id, name, webhook_url, is_forwarding) VALUES (?, ?, ?, ?, 0)',
      [channel_id, server_id, channel.name, webhook_url],
      function (err) {
        if (err) {
          console.error('Error adding channel:', err.message);
          return res.render('channels', {
            error: 'Error adding channel',
            channels: [],
            servers: [],
            isConnected: discordClients.size > 0
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
      function (err) {
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

    db.run('DELETE FROM channels WHERE id = ?', [channelId], function (err) {
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

app.get('/analytics', (req, res) => {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // Parallel queries for stats
  db.serialize(() => {
    // 1. Total Messages & Error Count
    db.get(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
       FROM logs`,
      (err, counts) => {
        if (err) {
          console.error('Error fetching analytics counts:', err);
          return res.status(500).send('Database error');
        }

        const totalMessages = counts.total || 0;
        const errorCount = counts.errors || 0;
        const successCount = totalMessages - errorCount;
        const successRate = totalMessages > 0 ? Math.round((successCount / totalMessages) * 100) : 100;

        // 2. Active Channels
        db.get('SELECT COUNT(*) as active FROM channels WHERE is_forwarding = 1', (err, channelStats) => {
          const activeChannels = channelStats ? channelStats.active : 0;

          // 3. Activity (Last 24h) - Group by Hour
          db.all(
            `SELECT strftime('%H:00', timestamp) as hour, COUNT(*) as count 
             FROM logs 
             WHERE timestamp > ? 
             GROUP BY hour 
             ORDER BY timestamp`,
            [twentyFourHoursAgo],
            (err, activityRows) => {
              // Process activity data for Chart.js
              const activityLabels = [];
              const activityData = [];
              // Fill in last 24 hours (simplified for now, just showing data points)
              activityRows.forEach(row => {
                activityLabels.push(row.hour);
                activityData.push(row.count);
              });

              // 4. Top Channels
              db.all(
                `SELECT channel_name, COUNT(*) as count 
                 FROM logs 
                 GROUP BY channel_id 
                 ORDER BY count DESC 
                 LIMIT 5`,
                (err, topChannels) => {
                  const channelLabels = topChannels.map(c => c.channel_name);
                  const channelData = topChannels.map(c => c.count);

                  // Get connection status for navbar
                  const isConnected = discordClients.size > 0;

                  res.render('analytics', {
                    isConnected,
                    stats: {
                      totalMessages,
                      successRate,
                      errorCount,
                      activeChannels
                    },
                    charts: {
                      activity: { labels: activityLabels, data: activityData },
                      channels: { labels: channelLabels, data: channelData }
                    },
                    error: null,
                    success: null
                  });
                }
              );
            }
          );
        });
      }
    );
  });
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

// --- Advanced Features Routes ---

// Update Channel Configuration
app.post('/channels/:id/config', (req, res) => {
  const channelId = req.params.id;
  const {
    filter_keywords,
    filter_blacklist,
    user_whitelist,
    user_blacklist,
    embed_enabled,
    embed_color,
    embed_footer,
    delay_min,
    delay_max
  } = req.body;

  const embedConfig = JSON.stringify({
    enabled: embed_enabled === 'on',
    color: embed_color,
    footer: embed_footer
  });

  db.run(
    `UPDATE channels SET 
      filter_keywords = ?, 
      filter_blacklist = ?, 
      user_whitelist = ?, 
      user_blacklist = ?, 
      embed_config = ?, 
      delay_min = ?, 
      delay_max = ? 
     WHERE id = ?`,
    [
      filter_keywords,
      filter_blacklist,
      user_whitelist,
      user_blacklist,
      embedConfig,
      parseInt(delay_min) || 0,
      parseInt(delay_max) || 0,
      channelId
    ],
    (err) => {
      if (err) {
        console.error('Error updating channel config:', err.message);
        return res.redirect('/?error=' + encodeURIComponent('Error updating configuration'));
      }
      res.redirect('/?success=' + encodeURIComponent('Configuration saved'));
    }
  );
});

// Add Extra Webhook
app.post('/channels/:id/webhooks', (req, res) => {
  const channelId = req.params.id;
  const { webhook_url, name } = req.body;

  db.run(
    'INSERT INTO channel_webhooks (channel_id, webhook_url, name) VALUES (?, ?, ?)',
    [channelId, webhook_url, name],
    (err) => {
      if (err) {
        console.error('Error adding webhook:', err.message);
        return res.redirect('/?error=' + encodeURIComponent('Error adding webhook'));
      }
      res.redirect('/?success=' + encodeURIComponent('Webhook added'));
    }
  );
});

// Delete Extra Webhook
app.post('/channels/:id/webhooks/delete', (req, res) => {
  const { webhook_id } = req.body;

  db.run('DELETE FROM channel_webhooks WHERE id = ?', [webhook_id], (err) => {
    if (err) {
      console.error('Error deleting webhook:', err.message);
      return res.redirect('/?error=' + encodeURIComponent('Error deleting webhook'));
    }
    res.redirect('/?success=' + encodeURIComponent('Webhook deleted'));
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
