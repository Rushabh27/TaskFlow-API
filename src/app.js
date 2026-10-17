require('dotenv').config();

const express = require("express");

const { createHmac, timingSafeEqual } = require("node:crypto");
const { router: tasksRouter } = require("./tasks");

const app = express();

function authenticateUser(req, res, next) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return res.status(503).json({
            error: "Authentication is not configured"
        });
    }

    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer ([^\s]+)$/);

    if (!match) {
        return res.status(401).json({ error: "Valid bearer token required" });
    }

    const parts = match[1].split(".");

    if (parts.length !== 3) {
        return res.status(401).json({ error: "Invalid token" });
    }

    const [headerPart, payloadPart, signaturePart] = parts;

    try {
        const header = JSON.parse(
            Buffer.from(headerPart, "base64url").toString("utf8")
        );
        const payload = JSON.parse(
            Buffer.from(payloadPart, "base64url").toString("utf8")
        );

        if (header.alg !== "HS256") {
            return res.status(401).json({ error: "Invalid token" });
        }

        const expected = createHmac("sha256", secret)
            .update(`${headerPart}.${payloadPart}`)
            .digest();

        const received = Buffer.from(signaturePart, "base64url");

        if (
            received.length !== expected.length ||
            !timingSafeEqual(received, expected)
        ) {
            return res.status(401).json({ error: "Invalid token" });
        }

        const now = Math.floor(Date.now() / 1000);

        if (
            typeof payload.sub !== "string" ||
            !payload.sub.trim() ||
            payload.sub !== payload.sub.trim() ||
            typeof payload.exp !== "number" ||
            payload.exp <= now ||
            (payload.nbf !== undefined &&
                (typeof payload.nbf !== "number" || payload.nbf > now))
        ) {
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        req.userId = payload.sub;
        return next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use(
    "/api/tasks",
    authenticateUser,
    express.json(),
    tasksRouter
);

module.exports = app;
