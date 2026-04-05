import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import recipesRouter from "./recipes";
import menusRouter from "./menus";
import shoppingRouter from "./shopping";
import mercadonaRouter from "./mercadona";
import emailRouter from "./email";
import { requireUser } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes (no auth needed)
router.use(healthRouter);
router.use(usersRouter);

// Protected routes (require X-User-Id header)
router.use(requireUser as any);
router.use(recipesRouter);
router.use(menusRouter);
router.use(shoppingRouter);
router.use(mercadonaRouter);
router.use(emailRouter);

export default router;
