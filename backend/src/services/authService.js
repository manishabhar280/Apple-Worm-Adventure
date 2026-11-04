import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const bcryptRounds = 12;
const jwtIssuer = "apple-worm-adventure";
const jwtAudience = "apple-worm-adventure-client";

export class AuthError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

function getJwtSettings() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  };
}

function toPublicUser(user) {
  return {
    id: String(user._id),
    displayName: user.displayName,
    email: user.email,
    avatar: user.avatar || "",
    role: user.role,
    createdAt: user.createdAt,
  };
}

function signAccessToken(user) {
  const { secret, expiresIn } = getJwtSettings();
  return jwt.sign(
    { sub: String(user._id), tokenVersion: user.tokenVersion || 0 },
    secret,
    {
      algorithm: "HS256",
      expiresIn,
      issuer: jwtIssuer,
      audience: jwtAudience,
    },
  );
}

export function verifyAccessToken(token) {
  const { secret } = getJwtSettings();
  return jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: jwtIssuer,
    audience: jwtAudience,
  });
}

async function findUserByEmail(User, email, includePassword = false) {
  let query = User.findOne({ email });
  if (includePassword && typeof query.select === "function") {
    query = query.select("+passwordHash");
  }
  return query;
}

export function createAuthService({ User }) {
  return {
    async register({ displayName, email, password }) {
      const existing = await findUserByEmail(User, email);
      if (existing) {
        throw new AuthError(409, "An account with this email already exists.");
      }

      const passwordHash = await bcrypt.hash(password, bcryptRounds);
      let user;
      try {
        user = await User.create({
          displayName,
          email,
          passwordHash,
          role: "player",
        });
      } catch (error) {
        if (error.code === 11000) {
          throw new AuthError(409, "An account with this email already exists.");
        }
        throw error;
      }

      return {
        user: toPublicUser(user),
        token: signAccessToken(user),
      };
    },

    async login({ email, password }) {
      const user = await findUserByEmail(User, email, true);
      const passwordMatches =
        user && (await bcrypt.compare(password, user.passwordHash || ""));
      if (!user || !user.isActive || !passwordMatches) {
        throw new AuthError(401, "Email or password is incorrect.");
      }

      return {
        user: toPublicUser(user),
        token: signAccessToken(user),
      };
    },

    async authenticate(token) {
      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch {
        throw new AuthError(401, "Authentication token is invalid or expired.");
      }
      if (!payload || typeof payload.sub !== "string") {
        throw new AuthError(401, "Authentication token is invalid or expired.");
      }

      const user = await User.findById(payload.sub);
      if (
        !user ||
        !user.isActive ||
        (payload.tokenVersion ?? 0) !== (user.tokenVersion || 0)
      ) {
        throw new AuthError(401, "Authentication token is invalid or expired.");
      }
      return user;
    },

    async revokeSessions(userId) {
      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { tokenVersion: 1 } },
        { new: true },
      );
      if (!user || !user.isActive) {
        throw new AuthError(401, "Authentication token is invalid or expired.");
      }
    },

    async updateProfile(userId, updates) {
      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        { new: true, runValidators: true },
      );
      if (!user || !user.isActive) {
        throw new AuthError(404, "User profile was not found.");
      }
      return toPublicUser(user);
    },

    getPublicUser: toPublicUser,
  };
}
