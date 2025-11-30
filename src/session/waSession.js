const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'auth_info.json');

function loadSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const data = fs.readFileSync(SESSION_FILE, 'utf8');
            return JSON.parse(data);
        } else {
            return {};
        }
    } catch (err) {
        console.error("❌ Error loading session:", err);
        return {};
    }
}

function saveSession(data) {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
        console.log("✅ Session Saved");
    } catch (err) {
        console.error("❌ Error saving session:", err);
    }
}

module.exports = { loadSession, saveSession };
