/**
 * AppError — the single custom error class used across all Streamify services.
 *
 * Usage:
 *   throw new AppError('Resource not found', 404);
 *   throw new AppError('Unauthorised', 401);
 *
 * The `errorHandler` middleware distinguishes AppError (operational / expected)
 * from unknown Error (programming error) and responds accordingly.
 */
export class AppError extends Error {
  /** HTTP status code to send in the response (e.g. 400, 401, 403, 404, 409, 422, 500). */
  public readonly statusCode: number;

  /**
   * Operational errors are expected domain errors (validation failures, not-found, etc.).
   * Non-operational errors (false) are programming bugs — the server should restart.
   */
  public readonly isOperational: boolean;

  /**
   * Field-level validation errors, keyed by field name.
   * Populated when wrapping Zod validation results.
   */
  public readonly errors?: Record<string, string[]>;

  constructor(
    message: string,
    statusCode: number,
    options?: {
      isOperational?: boolean;
      errors?: Record<string, string[]>;
    },
  ) {
    super(message);

    this.statusCode = statusCode;
    this.isOperational = options?.isOperational ?? true;
    this.errors = options?.errors;

    // Restore prototype chain broken by extending built-in Error
    Object.setPrototypeOf(this, AppError.prototype);

    // Capture clean stack trace (V8 only; no-op on other runtimes)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /** Convenience factory: 400 Bad Request */
  static badRequest(
    message = 'Bad Request',
    errors?: Record<string, string[]>,
  ): AppError {
    return new AppError(message, 400, { errors });
  }

  /** Convenience factory: 401 Unauthorised */
  static unauthorised(message = 'Unauthorised'): AppError {
    return new AppError(message, 401);
  }

  /** Convenience factory: 403 Forbidden */
  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(message, 403);
  }

  /** Convenience factory: 404 Not Found */
  static notFound(resource = 'Resource'): AppError {
    return new AppError(`${resource} not found`, 404);
  }

  /** Convenience factory: 409 Conflict */
  static conflict(message = 'Conflict'): AppError {
    return new AppError(message, 409);
  }

  /** Convenience factory: 422 Unprocessable Entity */
  static unprocessable(
    message = 'Unprocessable Entity',
    errors?: Record<string, string[]>,
  ): AppError {
    return new AppError(message, 422, { errors });
  }

  /** Convenience factory: 500 Internal Server Error (non-operational) */
  static internal(message = 'Internal Server Error'): AppError {
    return new AppError(message, 500, { isOperational: false });
  }
}
