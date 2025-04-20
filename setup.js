const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Colors for console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

console.log(`${colors.bright}${colors.blue}======================================================${colors.reset}`);
console.log(`${colors.bright}${colors.blue}       Discord Auto-Forwarder Setup Wizard         ${colors.reset}`);
console.log(`${colors.bright}${colors.blue}       (c) 2025 Benss | Discord: .naban            ${colors.reset}`);
console.log(`${colors.bright}${colors.blue}======================================================${colors.reset}\n`);

// Default configuration
const defaultConfig = {
  PORT: 3000,
  HOST: 'localhost',
  NODE_ENV: 'production',
  DISCORD_TOKEN: '',
  BASIC_AUTH_USER: '',
  BASIC_AUTH_PASSWORD: ''
};

// Function to create .env file
function createEnvFile(config) {
  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  fs.writeFileSync('.env', envContent);
  console.log(`${colors.green}✓ File .env berhasil dibuat${colors.reset}`);
}

// Function to check if a file exists
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    return false;
  }
}

// Function to install npm dependencies
function installDependencies() {
  console.log(`\n${colors.yellow}Menginstall dependensi npm...${colors.reset}`);
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log(`${colors.green}✓ Dependensi berhasil diinstall${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}✗ Gagal menginstall dependensi: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Main setup function
async function setup() {
  const config = { ...defaultConfig };
  
  // Check if .env already exists
  if (fileExists('.env')) {
    const answer = await new Promise(resolve => {
      rl.question(`${colors.yellow}File .env sudah ada. Apakah Anda ingin menggantinya? (y/n): ${colors.reset}`, resolve);
    });
    
    if (answer.toLowerCase() !== 'y') {
      console.log(`${colors.cyan}Menggunakan file .env yang sudah ada${colors.reset}`);
      return proceedWithInstallation();
    }
  }
  
  console.log(`${colors.cyan}Konfigurasi aplikasi:${colors.reset}`);
  
  // PORT configuration
  const port = await new Promise(resolve => {
    rl.question(`Port server (default: ${defaultConfig.PORT}): `, (answer) => {
      resolve(answer || defaultConfig.PORT);
    });
  });
  config.PORT = port;
  
  // HOST configuration
  console.log(`\n${colors.cyan}HOST:${colors.reset}`);
  console.log(`- ${colors.dim}localhost${colors.reset} = Hanya dapat diakses dari komputer ini`);
  console.log(`- ${colors.dim}0.0.0.0${colors.reset} = Dapat diakses dari jaringan lokal`);
  
  const host = await new Promise(resolve => {
    rl.question(`Host binding (default: ${defaultConfig.HOST}): `, (answer) => {
      resolve(answer || defaultConfig.HOST);
    });
  });
  config.HOST = host;
  
  // Discord token
  const token = await new Promise(resolve => {
    rl.question(`\n${colors.cyan}Token Discord (wajib): ${colors.reset}`, (answer) => {
      resolve(answer);
    });
  });
  
  if (!token) {
    console.log(`${colors.red}✗ Token Discord wajib diisi${colors.reset}`);
    process.exit(1);
  }
  config.DISCORD_TOKEN = token;
  
  // Basic auth configuration
  const useAuth = await new Promise(resolve => {
    rl.question(`\n${colors.cyan}Aktifkan basic authentication? (y/n, default: n): ${colors.reset}`, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
  
  if (useAuth) {
    const username = await new Promise(resolve => {
      rl.question(`Username: `, resolve);
    });
    
    const password = await new Promise(resolve => {
      rl.question(`Password: `, resolve);
    });
    
    if (username && password) {
      config.BASIC_AUTH_USER = username;
      config.BASIC_AUTH_PASSWORD = password;
    } else {
      console.log(`${colors.yellow}! Basic authentication tidak diaktifkan karena username atau password kosong${colors.reset}`);
    }
  }
  
  // Create .env file
  createEnvFile(config);
  
  return proceedWithInstallation();
}

async function proceedWithInstallation() {
  const installNpm = await new Promise(resolve => {
    rl.question(`\n${colors.cyan}Install dependensi npm? (y/n, default: y): ${colors.reset}`, (answer) => {
      resolve(answer.toLowerCase() !== 'n');
    });
  });
  
  if (installNpm) {
    installDependencies();
  }
  
  console.log(`\n${colors.bright}${colors.green}======================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.green}          Setup Selesai!                             ${colors.reset}`);
  console.log(`${colors.bright}${colors.green}======================================================${colors.reset}`);
  console.log(`\nJalankan aplikasi dengan perintah: ${colors.bright}node index.js${colors.reset}\n`);
  
  rl.close();
}

// Start setup
setup().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
}); 