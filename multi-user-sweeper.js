const { getUserManager } = require("./user-manager");

class MultiUserSweeper {
  constructor() {
    this.userSweepers = new Map(); // userId-chainKey -> sweeper instance
    this.userSweeperStates = new Map(); // userId -> { chainKey -> isActive }
  }

  // Get sweeper key for user and chain
  getSweeperKey(userId, chainKey) {
    return `${userId}-${chainKey}`;
  }

  // Initialize user sweeper state if not exists
  initUserState(userId) {
    if (!this.userSweeperStates.has(userId)) {
      this.userSweeperStates.set(userId, {});
    }
  }

  // Start sweeper for specific user
  startSweeperForUser(
    userId,
    chainKey,
    config,
    mnemonic,
    destAddress,
    eventCallback
  ) {
    this.initUserState(userId);

    const sweeperKey = this.getSweeperKey(userId, chainKey);
    const userState = this.userSweeperStates.get(userId);

    if (userState[chainKey]) {
      return false; // Already running
    }

    // Import the original sweeper start function
    const { startSweeper } = require("./sweeper");

    // Create a user-specific event callback
    const userEventCallback = (event) => {
      const userEvent = `👤 User ${userId.substring(0, 8)}...: ${event}`;
      console.log(userEvent);
      eventCallback(event); // Send to user
    };

    // Start the sweeper with user-specific callback
    const sweeperId = startSweeper(
      chainKey,
      config,
      mnemonic,
      destAddress,
      userEventCallback,
      userId
    );

    // Track the sweeper
    this.userSweepers.set(sweeperKey, sweeperId);
    userState[chainKey] = true;
    this.userSweeperStates.set(userId, userState);

    console.log(`🚀 Started sweeper for user ${userId} on ${chainKey}`);
    return true;
  }

  // Stop all sweepers for specific user
  stopAllSweepersForUser(userId) {
    this.initUserState(userId);

    const userState = this.userSweeperStates.get(userId);
    let stoppedCount = 0;

    // Import the original sweeper functions
    const { stopSweeper } = require("./sweeper");

    for (const [chainKey, isActive] of Object.entries(userState)) {
      if (isActive) {
        const sweeperKey = this.getSweeperKey(userId, chainKey);
        const sweeperId = this.userSweepers.get(sweeperKey);

        if (sweeperId) {
          stopSweeper(chainKey, userId);
          this.userSweepers.delete(sweeperKey);
          stoppedCount++;
        }

        userState[chainKey] = false;
      }
    }

    this.userSweeperStates.set(userId, userState);
    console.log(`⏹️ Stopped ${stoppedCount} sweepers for user ${userId}`);
    return stoppedCount;
  }

  // Get sweeper status for user
  getUserSweeperStatus(userId, chainKey) {
    this.initUserState(userId);

    const userState = this.userSweeperStates.get(userId);
    return userState[chainKey] || false;
  }

  // Get all active sweepers for user
  getUserActiveSweepers(userId) {
    this.initUserState(userId);

    const userState = this.userSweeperStates.get(userId);
    const activeSweepers = [];

    for (const [chainKey, isActive] of Object.entries(userState)) {
      if (isActive) {
        activeSweepers.push(chainKey);
      }
    }

    return activeSweepers;
  }

  // Stop all sweepers for all users (admin function)
  stopAllSweepers() {
    const { stopAllSweepers } = require("./sweeper");
    stopAllSweepers();

    // Clear our tracking
    this.userSweepers.clear();
    for (const [userId, userState] of this.userSweeperStates.entries()) {
      const clearedState = {};
      for (const chainKey of Object.keys(userState)) {
        clearedState[chainKey] = false;
      }
      this.userSweeperStates.set(userId, clearedState);
    }

    console.log("🛑 All sweepers stopped for all users");
  }

  // Get global statistics
  getGlobalStats() {
    let totalActiveSweepers = 0;
    const userManager = getUserManager();

    for (const [userId, userState] of this.userSweeperStates.entries()) {
      for (const [chainKey, isActive] of Object.entries(userState)) {
        if (isActive) {
          totalActiveSweepers++;
        }
      }
    }

    return {
      totalUsers: userManager.getUserCount(),
      maxUsers: userManager.getMaxUsers(),
      totalActiveSweepers,
      activeUsers: this.userSweeperStates.size,
    };
  }

  // Clean up inactive users (called periodically)
  cleanupInactiveUsers() {
    const userManager = getUserManager();
    const now = new Date();
    let cleanedUp = 0;

    for (const [userId] of this.userSweeperStates.entries()) {
      const userData = userManager.getUserData(userId);
      if (userData) {
        const lastActive = new Date(userData.lastActive);
        const hoursSinceActive = (now - lastActive) / (1000 * 60 * 60);

        // Clean up users inactive for more than 24 hours
        if (hoursSinceActive > 24) {
          this.stopAllSweepersForUser(userId);
          this.userSweeperStates.delete(userId);
          cleanedUp++;
        }
      }
    }

    if (cleanedUp > 0) {
      console.log(`🧹 Cleaned up ${cleanedUp} inactive user sweeper states`);
    }

    return cleanedUp;
  }
}

// Singleton instance
let multiUserSweeperInstance = null;

function getMultiUserSweeper() {
  if (!multiUserSweeperInstance) {
    multiUserSweeperInstance = new MultiUserSweeper();
  }
  return multiUserSweeperInstance;
}

// Clean up inactive users every hour
// setInterval(() => {
//   const sweeper = getMultiUserSweeper();
//   sweeper.cleanupInactiveUsers();
// }, 60 * 60 * 1000);

module.exports = {
  getMultiUserSweeper,
  MultiUserSweeper,
};
