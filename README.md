# Discord Auto-Forwarder

A utility to forward messages from Discord servers to webhooks, allowing you to mirror content from one server to another.

## Features

- Connect to multiple Discord servers
- Forward messages from selected channels to webhook URLs
- Track message forwarding statistics
- Web interface for easy configuration
- Optional ngrok integration for remote access

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- A Discord user token (selfbot)
- For remote access: [ngrok](https://ngrok.com/) account and authtoken

## Installation

1. Clone or download this repository
2. Run `run-setup.bat` to automatically:
   - Install dependencies
   - Set up PM2 for process management
   - Install and configure ngrok
   - Create default configuration files
3. Or manually create a `.env` file with:
   ```
   PORT=3000
   DISCORD_TOKEN=your_discord_token_here
   ```

## Quick Start

The easiest way to start using Discord Auto-Forwarder is through the all-in-one launcher:

1. Run `autoforwarder.bat`
2. Select option 1 to start the Discord Auto-Forwarder
3. Access the web interface at http://localhost:3000

## Setup with ngrok (For Remote Access)

If you want to access your Discord Auto-Forwarder from another device:

1. Run `autoforwarder.bat`
2. Select option 4 to set up ngrok (first-time only)
3. Enter your ngrok authtoken when prompted
4. Select option 5 to start an ngrok tunnel
5. Access the web interface using the ngrok URL provided

### About Batch Files

The application includes several batch files to make operation easier:

- **run-setup.bat**: One-click setup for all components (dependencies, PM2, ngrok)
- **autoforwarder.bat**: All-in-one control panel with all features in a single menu
- **github-push.bat**: Helps push your changes to GitHub

All batch files include proper error handling and will pause before closing so you can see any messages.

## Usage

### Web Interface

The web interface provides an easy way to:
- View and manage connected Discord servers
- Configure channel forwarding
- Monitor message statistics
- Set up webhook destinations

### Adding a Server

1. Go to the Servers page
2. Click "Add Server"
3. Enter your Discord token
4. The server will be added to your list

### Setting Up Forwarding

1. Go to the Channels page
2. Find the channel you want to forward
3. Enter the webhook URL where messages should be sent
4. Toggle the "Forwarding" switch to enable forwarding

## Deployment Options

You can deploy this application using either **PM2** (Process Manager) or **Docker**.

### Option 1: PM2 (Recommended for VPS)
PM2 ensures the application stays online and restarts automatically if it crashes.

**Quick Start**: Run `start-pm2.bat`

**Manual Setup**:
1.  **Install PM2**: `npm install -g pm2`
2.  **Start**: `pm2 start ecosystem.config.js`
3.  **Monitor**: `pm2 monit`

### Option 2: Docker (Recommended for Containerization)
Docker provides an isolated environment, ensuring consistency across different systems.

**Quick Start**: Run `start-docker.bat`

**Manual Setup**:
1.  **Build & Start**: `docker-compose up -d`
2.  **View Logs**: `docker-compose logs -f`
3.  **Stop**: `docker-compose down`

## Troubleshooting

- Check the logs directory for error logs
- Make sure your Discord token is valid
- Verify that webhook URLs are correctly formatted
- Ensure the port is not in use by another application

### Common Issues

- **Batch files close immediately**: If batch files close too quickly, run them from the command line to see error messages
- **Ngrok not connecting**: Verify your authtoken is correct and that your account has an active plan if using custom domains
- **Port already in use**: Use `stop-autoforwarder.bat` to stop any running instances, or change the port in your .env file

## Security Considerations

- Your Discord token grants full access to your account. Never share it.
- If using ngrok, consider setting up authentication for your tunnel.
- The application stores sensitive information in the local database.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This application uses selfbot functionality, which is against Discord's Terms of Service. Use at your own risk. The developers are not responsible for any consequences of using this software, including account termination.