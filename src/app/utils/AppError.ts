class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
