import type { Response } from 'express';

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  statusCode: number;
  details?: unknown;
}

/**
 * Send a JSON success response.
 */
export function sendSuccess<T = unknown>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
): void {
  const body: SuccessResponse<T> = { success: true, data };
  if (message !== undefined) body.message = message;
  res.status(statusCode).json(body);
}

/**
 * Send a JSON error response.
 */
export function sendError(
  res: Response,
  error: string,
  statusCode = 500,
  details?: unknown,
): void {
  const body: ErrorResponse = { success: false, error, statusCode };
  if (details !== undefined) body.details = details;
  res.status(statusCode).json(body);
}
