import express from "express";
import { loginStudent, loginUser, registerStudent, registerUser } from "../controllers/authController";



const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/students/register", registerStudent);
router.post("/students/login", loginStudent);


export default router;
