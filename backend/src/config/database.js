import mongoose from "mongoose";

const connectionStates = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

mongoose.connection.on("connected", () => {
  console.info("MongoDB connection established.");
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB connection disconnected.");
});

mongoose.connection.on("error", () => {
  console.error("MongoDB connection error. Check the connection URI and database availability.");
});

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not configured; database features are unavailable.");
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    return true;
  } catch {
    console.error("Unable to connect to MongoDB. Check MONGODB_URI and ensure the database is reachable.");
    return false;
  }
}

export function getDatabaseStatus() {
  const state = mongoose.connection.readyState;
  return {
    status: connectionStates[state] || "unknown",
    connected: state === 1,
  };
}

export async function closeDatabase() {
  await mongoose.disconnect();
}
