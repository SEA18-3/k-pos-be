import { format, transports } from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

export const winstonConfig = {
  level: isProduction ? 'info' : 'debug',
  format: isProduction
    ? format.combine(format.timestamp(), format.json())
    : format.combine(
        format.timestamp(),
        format.colorize(),
        format.printf(({ timestamp, level, message, context, trace }) => {
          return `${timestamp as string} [${(context as string) || 'App'}] ${level}: ${message as string}${trace ? `\n${trace as string}` : ''}`;
        }),
      ),
  transports: [new transports.Console()],
};
