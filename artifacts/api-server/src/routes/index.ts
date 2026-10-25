import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import publicRouter from "./public";
import recipesRouter from "./recipes";
import menusRouter from "./menus";
import shoppingRouter from "./shopping";
import mercadonaRouter from "./mercadona";
import emailRouter from "./email";
import aiChatRouter from "./ai-chat";
import savedMenusRouter from "./saved-menus";
import { requireUser } from "../middlewares/auth";
import whatsappRouter from "./whatsapp";
import { connectorRouter, mercadonaAccountRouter } from "./mercadona-connector";

const router: IRouter = Router();

// Public routes (no auth needed)
router.use(healthRouter);
router.use(usersRouter);
router.use(publicRouter);
// Mercadona bookmarklet: authenticated with its own connector token
router.use("/mercadona-connector", connectorRouter);

// Protected routes (require X-User-Id header)
router.use(requireUser as any);
router.use(whatsappRouter);
router.use(recipesRouter);
router.use(menusRouter);
router.use(shoppingRouter);
router.use(mercadonaRouter);
router.use(mercadonaAccountRouter);
router.use(emailRouter);
router.use(aiChatRouter);
router.use(savedMenusRouter);

export default router;
