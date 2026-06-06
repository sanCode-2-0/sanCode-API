// middleware/verifyParentToken.js
const jwt = require("jsonwebtoken");
const { KEYS } = require("../config/keys.js");

const verifyParentToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access Denied: Authentication token missing." });
  }

  jwt.verify(token, KEYS.JWT_SECRET, (err, decoded) => {
    if (err || decoded.scope !== "parent_lookup") {
      return res.status(403).json({ error: "Access Denied: Session expired or invalid token." });
    }

    // Bind the decoded parent scope and child's admission number to request
    req.parent = decoded;
    next();
  });
};

module.exports = {
  verifyParentToken
};
