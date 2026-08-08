import { Router } from 'express';
import * as searchController from '../controllers/search.controller.js';

const router: Router = Router();

// /search routes
router.get('/', searchController.search);
router.get('/suggest', searchController.suggest);
router.get('/trending', searchController.trending);

export default router;
