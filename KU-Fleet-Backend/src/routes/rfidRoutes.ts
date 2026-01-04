import { Router } from "express";
import { handleRfidScan } from "../controllers/rfidController";

const router = Router();

router.post("/scan", handleRfidScan);

export default router;
