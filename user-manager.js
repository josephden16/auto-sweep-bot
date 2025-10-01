const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MAX_USERS = parseInt(process.env.MAX_USERS) || 3;
const DATA_DIR = "./";
const USERS_FILE = path.join(DATA_DIR, "users.json");
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "default-key-change-in-production";

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class UserManager {
  constructor() {
    this.users = new Map();
    this.loadUsers();
  }

  // Load users from file
  loadUsers() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const data = fs.readFileSync(USERS_FILE, "utf8");
        const usersData = JSON.parse(data);

        for (const [userId, userData] of Object.entries(usersData)) {
          this.users.set(userId, userData);
        }

        console.log(`📋 Loaded ${this.users.size} users from storage`);
      }
    } catch (error) {
      console.error("❌ Error loading users:", error.message);
      this.users = new Map();
    }
  }

  // Save users to file
  saveUsers() {
    try {
      const usersObject = Object.fromEntries(this.users);
      fs.writeFileSync(USERS_FILE, JSON.stringify(usersObject, null, 2));
    } catch (error) {
      console.error("❌ Error saving users:", error.message);
    }
  }

  // Encrypt sensitive data
  encrypt(text, userId) {
    try {
      const algorithm = "aes-256-cbc";
      const key = crypto.scryptSync(ENCRYPTION_KEY + userId, "salt", 32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      return {
        encrypted,
        iv: iv.toString("hex"),
      };
    } catch (error) {
      console.error("❌ Encryption error:", error.message);
      return null;
    }
  }

  // Decrypt sensitive data
  decrypt(encryptedData, userId) {
    try {
      const algorithm = "aes-256-cbc";
      const key = crypto.scryptSync(ENCRYPTION_KEY + userId, "salt", 32);
      const iv = Buffer.from(encryptedData.iv, "hex");

      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      console.error("❌ Decryption error:", error.message);
      return null;
    }
  }

  // Check if user can register (under user limit)
  canRegisterNewUser() {
    return this.users.size < MAX_USERS;
  }

  // Get current user count
  getUserCount() {
    return this.users.size;
  }

  // Get max users limit
  getMaxUsers() {
    return MAX_USERS;
  }

  // Register new user
  async registerUser(userId) {
    if (!this.canRegisterNewUser()) {
      throw new Error(`Maximum user limit reached (${MAX_USERS} users)`);
    }

    if (this.users.has(userId)) {
      return this.users.get(userId);
    }

    const userData = {
      id: userId,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      mnemonic: null,
      destAddress: null,
      isSetupComplete: false,
    };

    this.users.set(userId, userData);
    this.saveUsers();

    console.log(
      `👤 New user registered: ${userId} (${this.users.size}/${MAX_USERS})`
    );
    return userData;
  }

  // Get user data
  getUserData(userId) {
    return this.users.get(userId) || null;
  }

  // Update user data
  async updateUserData(userId, updates) {
    const userData = this.users.get(userId);
    if (!userData) {
      throw new Error("User not found");
    }

    const updatedData = {
      ...userData,
      ...updates,
      lastActive: new Date().toISOString(),
    };

    this.users.set(userId, updatedData);
    this.saveUsers();

    return updatedData;
  }

  // Set user mnemonic (encrypted)
  async setUserMnemonic(userId, mnemonic) {
    const encryptedMnemonic = this.encrypt(mnemonic, userId);
    if (!encryptedMnemonic) {
      throw new Error("Failed to encrypt mnemonic");
    }

    return await this.updateUserData(userId, {
      mnemonic: encryptedMnemonic,
      isSetupComplete: this.getUserData(userId)?.destAddress ? true : false,
    });
  }

  // Get user mnemonic (decrypted)
  getUserMnemonic(userId) {
    const userData = this.users.get(userId);
    if (!userData || !userData.mnemonic) {
      return null;
    }

    return this.decrypt(userData.mnemonic, userId);
  }

  // Set user destination address
  async setUserDestAddress(userId, destAddress) {
    return await this.updateUserData(userId, {
      destAddress,
      isSetupComplete: this.getUserData(userId)?.mnemonic ? true : false,
    });
  }

  // Check if user setup is complete
  isUserSetupComplete(userId) {
    const userData = this.users.get(userId);
    return userData?.isSetupComplete || false;
  }

  // Delete user
  async deleteUser(userId) {
    if (this.users.has(userId)) {
      this.users.delete(userId);
      this.saveUsers();
      console.log(`🗑️ User deleted: ${userId}`);
      return true;
    }
    return false;
  }

  // Get all users (admin function)
  getAllUsers() {
    return Array.from(this.users.entries()).map(([id, data]) => ({
      id,
      createdAt: data.createdAt,
      lastActive: data.lastActive,
      isSetupComplete: data.isSetupComplete,
      hasDestAddress: !!data.destAddress,
    }));
  }

  // Update user activity
  updateUserActivity(userId) {
    const userData = this.users.get(userId);
    if (userData) {
      userData.lastActive = new Date().toISOString();
      this.users.set(userId, userData);
      // Save periodically, not on every activity update
      if (Math.random() < 0.1) {
        // 10% chance to save
        this.saveUsers();
      }
    }
  }
}

// Singleton instance
let userManagerInstance = null;

function getUserManager() {
  if (!userManagerInstance) {
    userManagerInstance = new UserManager();
  }
  return userManagerInstance;
}

module.exports = {
  getUserManager,
  UserManager,
};
