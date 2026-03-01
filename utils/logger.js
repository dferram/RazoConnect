/**
 * WINSTON LOGGER
 * Structured logging con Winston para Azure Log Analytics
 * 
 * @module utils/logger
 * @author RazoConnect Team
 * @date 2026-03-01
 */

const winston = require('winston');

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'warn' : 'info'),
  format: combine(
    errors({ stack: true }),
    timestamp(),
    json()  // JSON estructurado para Azure Log Analytics
  ),
  transports: [
    new winston.transports.Console({
      format: isProduction
        ? combine(errors({ stack: true }), timestamp(), json())
        : combine(colorize(), simple()),  // Legible en desarrollo
    }),
  ],
});

module.exports = logger;
