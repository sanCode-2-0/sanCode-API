import {KEYS} from "../config/keys.js";

export const errorHandler = (error, req, res, next) => {
    const statusCode = res.statusCode ? res.statusCode : 500

    res.status(statusCode)

    res.json({
        message: error.message,
        stack: KEYS.NODE_ENV === "production" ?  null : error.stack
    })
}