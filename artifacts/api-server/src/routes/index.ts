import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipesRouter from "./recipes";
import menusRouter from "./menus";
import shoppingRouter from "./shopping";
import mercadonaRouter from "./mercadona";

const router: IRouter = Router();

router.use(healthRouter);
router.use(recipesRouter);
router.use(menusRouter);
router.use(shoppingRouter);
router.use(mercadonaRouter);

export default router;
