
function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    // Invalid JSON sent in the request body.
    if (err.type === "entity.parse.failed" && err.status === 400) {
        return res.status(400).json({
            error: "Invalid JSON payload"
        });
    }

    // Log internal details on the server, never in the response.
    console.error(err);

    return res.status(500).json({
        error: "Internal server error"
    });
}

module.exports = errorHandler;
