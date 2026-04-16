import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(level: string = "info"): Logger {
  return pino({
    level,
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            target: "pino/file",
            options: { destination: 2, colorize: false },
          },
  });
}
