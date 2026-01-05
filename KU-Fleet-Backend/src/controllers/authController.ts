import { Request, Response } from "express";
import bcrypt from "bcrypt";
import User from "../models/User.model";
import { generateToken } from "../utils/generateToken";

/** ----------------- GENERAL USER ----------------- */
export const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    // Email/password registration only for admin/driver/parent
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required for this registration type",
      });
    }

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ message: "User with this email already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
    });

    res.status(201).json({
      message: "User registered successfully",
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password ?? "");
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user._id.toString());

    res.status(200).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

/** ----------------- STUDENT SPECIFIC ----------------- */
// Admin registers student with RFID
export const registerStudent = async (req: Request, res: Response) => {
  try {
    const { name, rfidCardUID } = req.body;

    if (!name || !rfidCardUID) {
      return res.status(400).json({ message: "Name and RFID UID are required" });
    }

    // Normalize UID: uppercase and remove spaces
    const normalizedUID = rfidCardUID.replace(/\s+/g, "").toUpperCase();

    const exists = await User.findOne({ rfidCardUID: normalizedUID });
    if (exists)
      return res.status(400).json({ message: "RFID UID already registered" });

    const student = await User.create({
      name,
      rfidCardUID: normalizedUID,
      role: "student",
      status: "active",
    });

    res.status(201).json({ message: "Student registered successfully", student });
  } catch (error: any) {
    res.status(500).json({ message: "Student registration failed", error: error.message });
  }
};

// Student login via RFID
export const loginStudent = async (req: Request, res: Response) => {
  try {
    const { rfidCardUID } = req.body;
    if (!rfidCardUID) return res.status(400).json({ message: "RFID UID required" });

    const normalizedUID = rfidCardUID.replace(/\s+/g, "").toUpperCase();

    const student = await User.findOne({
      rfidCardUID: normalizedUID,
      role: "student",
      status: "active",
    });

    if (!student) return res.status(404).json({ message: "Invalid RFID card" });

    const token = generateToken(student._id.toString());

    res.status(200).json({
      token,
      student: {
        id: student._id,
        name: student.name,
        rfidCardUID: student.rfidCardUID,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Student login failed", error: error.message });
  }
};
