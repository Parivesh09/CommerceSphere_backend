import winston from 'winston';
import { getCorrelationId } from './correlation';

export interface LoggerConfig {
  serviceName: string;
  level?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  logFilePath?: string;
}


const correlationFormat = winston.format((info) => {
  const correlationId = getCorrelationId();
  if (correlationId) {
    info.correlationId = correlationId;
  }
  return info;
});

export const createLogger = (config: LoggerConfig) => {
  const { 
    serviceName, 
    level = 'info',
    enableConsole = true,
    enableFile = false,
    logFilePath = 'logs/app.log'
  } = config;

  const transports: winston.transport[] = [];


  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, correlationId, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            const corrId = correlationId ? `[${correlationId}]` : '';
            return `${timestamp} ${level} [${service}] ${corrId} ${message} ${metaStr}`;
          })
        ),
      })
    );
  }


  if (enableFile) {
    transports.push(
      new winston.transports.File({
        filename: logFilePath,
        format: winston.format.json(),
      })
    );
  }

  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      correlationFormat(),
      winston.format.json()
    ),
    defaultMeta: { service: serviceName },
    transports,
  });
};

export type Logger = ReturnType<typeof createLogger>;


export const createChildLogger = (logger: Logger, context: Record<string, unknown>) => {
  return logger.child(context);
};


export const logger = createLogger({
  serviceName: process.env.SERVICE_NAME || 'shared-utils',
  level: process.env.LOG_LEVEL || 'info',
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
});
