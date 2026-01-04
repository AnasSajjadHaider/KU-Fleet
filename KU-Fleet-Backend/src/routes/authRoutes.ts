import express from "express";
import { loginStudent, loginUser, registerStudent, registerUser } from "../controllers/authController";
import { adminOnly, protect } from "../middleware/AuthMiddleware";



const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/students/register",protect,adminOnly, registerStudent);
router.post("/students/login", loginStudent);


export default router;
