/**
 * History controller — HTTP handlers for listening history endpoints.
 */

import type { Request, Response, RequestHandler } from 'express';
import { catchAsync } from '@streamify/shared-middleware';
import type { PaginationInput } from '../validators/user.validators.js';
import * as historyService from '../services/history.service.js';

/** GET /users/me/history */
export const getHistory: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { page, limit } = req.query as unknown as PaginationInput;

  const result = await historyService.getMyHistory(userId, page ?? 1, limit ?? 20);
  res.json({ success: true, data: result });
});
