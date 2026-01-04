import { Request, Response } from "express";
import bcrypt from "bcrypt";
import User from "../models/User.model";
import { generateToken } from "../utils/generateToken";

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({ name, email, password: hashed, role });
    res.status(201).json({ 
      message: "User registered", 
      user: { id: user._id, name, email, role } 
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user.id);

    res.status(200).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error });
  }
};



/** ----------------- STUDENT SPECIFIC ----------------- */
// Admin registers student
export const registerStudent = async (req: Request, res: Response) => {
  try {
    const { name, rfidCardUID } = req.body;

    if (!name || !rfidCardUID) {
      return res.status(400).json({ message: "Name and RFID UID are required" });
    }

    // Normalize UID: uppercase, remove spaces
    const normalizedUID = rfidCardUID.replace(/\s+/g, "").toUpperCase();

    const exists = await User.findOne({ rfidCardUID: normalizedUID });
    if (exists) {
      return res.status(400).json({ message: "RFID UID already registered" });
    }

    const student = await User.create({
      name,
      rfidCardUID: normalizedUID,
      role: "student",
      status: "active",
    });

    res.status(201).json({ message: "Student registered", student });
  } catch (error) {
    res.status(500).json({ message: "Student registration failed", error });
  }
};


// Student login via RFID
export const loginStudent = async (req: Request, res: Response) => {
  try {
    const { rfidCardUID } = req.body;
    if (!rfidCardUID) return res.status(400).json({ message: "RFID UID required" });

    // Normalize UID: uppercase, remove spaces
    const normalizedUID = rfidCardUID.replace(/\s+/g, "").toUpperCase();

    const student = await User.findOne({
      rfidCardUID: normalizedUID,
      role: "student",
      status: "active",
    });

    if (!student) return res.status(404).json({ message: "Invalid RFID card" });

    const token = generateToken(student.id);

    res.status(200).json({
      token,
      student: {
        id: student._id,
        name: student.name,
        rfidCardUID: student.rfidCardUID,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Student login failed", error });
  }
};
