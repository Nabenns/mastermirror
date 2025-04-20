/**
 * Discord.js-selfbot-v13 Direct Fix Script
 * 
 * This script directly fixes the "Cannot read properties of null (reading 'all')" error
 * in ClientUserSettingManager.js by making specific changes to handle null friend_source_flags.
 */

const fs = require('fs');
const path = require('path');

// Path to the file
const filePath = path.join(__dirname, 'node_modules', 'discord.js-selfbot-v13', 'src', 'managers', 'ClientUserSettingManager.js');

console.log('Attempting to fix discord.js-selfbot-v13...');

// Check if file exists
if (!fs.existsSync(filePath)) {
    console.error('Error: Could not find ClientUserSettingManager.js file!');
    process.exit(1);
}

try {
    // Read the file
    let fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Make a backup first
    const backupPath = filePath + '.backup';
    if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, fileContent);
        console.log(`Created backup at ${backupPath}`);
    }
    
    // The most comprehensive way to fix this is to completely replace the friend_source_flags section
    // Find the section that starts with friend_source_flags: {
    // This should handle all references to friend_source_flags including line 201 and 202
    
    const replacementPattern = /friend_source_flags\s*:\s*{[^}]*}/g;
    const safeReplacement = `friend_source_flags: {
        all: data.friend_source_flags?.all || false,
        mutual_friends: data.friend_source_flags?.all ? true : data.friend_source_flags?.mutual_friends || false,
        mutual_guilds: data.friend_source_flags?.all ? true : data.friend_source_flags?.mutual_guilds || false
      }`;
    
    // Apply the replacement
    if (fileContent.match(replacementPattern)) {
        console.log('Found friend_source_flags section to replace');
        fileContent = fileContent.replace(replacementPattern, safeReplacement);
    } else {
        // Fallback to individual replacements if we can't find the pattern
        console.log('Using fallback replacement method');
        
        // Replace line 201
        fileContent = fileContent.replace(
            /all\s*:\s*data\.friend_source_flags\.all/g, 
            'all: data.friend_source_flags?.all || false'
        );
        
        // Replace line 202
        fileContent = fileContent.replace(
            /mutual_friends\s*:\s*data\.friend_source_flags\.all\s*\?\s*true\s*:\s*data\.friend_source_flags\.mutual_friends/g, 
            'mutual_friends: data.friend_source_flags?.all ? true : data.friend_source_flags?.mutual_friends || false'
        );
        
        // Replace line 203
        fileContent = fileContent.replace(
            /mutual_guilds\s*:\s*data\.friend_source_flags\.all\s*\?\s*true\s*:\s*data\.friend_source_flags\.mutual_guilds/g, 
            'mutual_guilds: data.friend_source_flags?.all ? true : data.friend_source_flags?.mutual_guilds || false'
        );
    }
    
    // Write the fixed content back to the file
    fs.writeFileSync(filePath, fileContent);
    
    console.log('Successfully fixed ClientUserSettingManager.js!');
    console.log('Added safe handling for friend_source_flags including line 202.');
    console.log('The application should now work without the error.');
    
} catch (error) {
    console.error('Error while fixing the file:', error.message);
    process.exit(1);
} 