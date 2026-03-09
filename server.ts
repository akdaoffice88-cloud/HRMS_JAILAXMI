import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isCloud = !!process.env.DATABASE_URL;
let db: any;
let sql: any;

if (isCloud) {
  sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
  console.log("Using Cloud Database (PostgreSQL)");
} else {
  db = new Database("hrms.db");
  console.log("Using Local Database (SQLite)");
}

// Helper to handle DB queries for both SQLite and Postgres
const query = {
  async exec(sqlStr: string) {
    if (isCloud) {
      // Convert SQLite CREATE syntax to Postgres if needed
      let pSql = sqlStr.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, "SERIAL PRIMARY KEY");
      await sql.unsafe(pSql);
    } else {
      db.exec(sqlStr);
    }
  },
  async get(sqlStr: string, params: any[] = []) {
    if (isCloud) {
      let pSql = sqlStr;
      params.forEach((_, i) => { pSql = pSql.replace('?', `$${i + 1}`); });
      const rows = await sql.unsafe(pSql, params);
      return rows[0];
    } else {
      return db.prepare(sqlStr).get(...params);
    }
  },
  async all(sqlStr: string, params: any[] = []) {
    if (isCloud) {
      let pSql = sqlStr;
      params.forEach((_, i) => { pSql = pSql.replace('?', `$${i + 1}`); });
      return await sql.unsafe(pSql, params);
    } else {
      return db.prepare(sqlStr).all(...params);
    }
  },
  async run(sqlStr: string, params: any[] = []) {
    if (isCloud) {
      let pSql = sqlStr;
      params.forEach((_, i) => { pSql = pSql.replace('?', `$${i + 1}`); });
      await sql.unsafe(pSql, params);
    } else {
      db.prepare(sqlStr).run(...params);
    }
  }
};

async function initDb() {
  await query.exec(`
    CREATE TABLE IF NOT EXISTS applicants (
      id TEXT PRIMARY KEY,
      fullName TEXT,
      fatherName TEXT,
      fatherEducation TEXT,
      fatherSalary TEXT,
      fatherEmployment TEXT,
      fatherMobile TEXT,
      motherName TEXT,
      motherEducation TEXT,
      motherSalary TEXT,
      motherEmployment TEXT,
      motherMobile TEXT,
      spouseName TEXT,
      spouseEducation TEXT,
      spouseSalary TEXT,
      spouseEmployment TEXT,
      spouseMobile TEXT,
      gender TEXT,
      dob TEXT,
      mobileNumber TEXT,
      emailId TEXT,
      permanentAddress TEXT,
      city TEXT,
      pincode TEXT,
      aadhaarNumber TEXT,
      panNumber TEXT,
      drivingLicenceNumber TEXT,
      bloodGroup TEXT,
      maritalStatus TEXT,
      numberOfKids INTEGER,
      kidsDetails TEXT,
      numberOfSiblings INTEGER,
      siblingsDetails TEXT,
      emergencyContactName TEXT,
      emergencyContactNumber TEXT,
      experienceType TEXT,
      positionApplied TEXT,
      branch TEXT,
      district TEXT,
      degreeType TEXT,
      instituteName TEXT,
      educationDetails TEXT,
      passedOutYear TEXT,
      numberOfCompanies INTEGER,
      experienceDetails TEXT,
      currentSalary TEXT,
      expectedSalary TEXT,
      sourceOfApplication TEXT,
      sourceRemark TEXT,
      refererName TEXT,
      refererBranch TEXT,
      refererDesignation TEXT,
      refererEmpId TEXT,
      refererMobile TEXT,
      interviewScore TEXT,
      interviewRemarks TEXT,
      status TEXT,
      submittedBy TEXT,
      submittedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      role TEXT,
      password TEXT
    );
  `);

  const userCount = await query.get("SELECT count(*) as count FROM users");
  if (parseInt(userCount.count) === 0) {
    await query.run("INSERT INTO users (id, email, name, role, password) VALUES (?, ?, ?, ?, ?)", ['admin', 'admin@prohrms.com', 'Super Admin', 'ADMIN', 'admin123']);
    await query.run("INSERT INTO users (id, email, name, role, password) VALUES (?, ?, ?, ?, ?)", ['hr1', 'hr1@prohrms.com', 'Priya Sharma', 'HR', 'hr123']);
    await query.run("INSERT INTO users (id, email, name, role, password) VALUES (?, ?, ?, ?, ?)", ['hr2', 'hr2@prohrms.com', 'Arun Kumar', 'HR', 'hr123']);
  }
}

async function startServer() {
  await initDb();
  
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth & User Routes
  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await query.get("SELECT * FROM users WHERE email = ? AND password = ?", [email, password]);
      if (user) {
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      const rows = await query.all("SELECT id, email, name, role FROM users");
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users", async (req, res) => {
    const { email, name, role, password } = req.body;
    const id = Math.random().toString(36).substr(2, 9);
    try {
      await query.run("INSERT INTO users (id, email, name, role, password) VALUES (?, ?, ?, ?, ?)", [id, email, name, role, password]);
      res.status(201).json({ message: "User created" });
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await query.run("DELETE FROM users WHERE id = ?", [id]);
      res.json({ message: "User deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // API Routes
  app.get("/api/applicants", async (req, res) => {
    try {
      const rows = await query.all("SELECT * FROM applicants ORDER BY submittedAt DESC");
      const applicants = rows.map((row: any) => ({
        ...row,
        kidsDetails: JSON.parse(row.kidsdetails || row.kidsDetails || "[]"),
        siblingsDetails: JSON.parse(row.siblingsdetails || row.siblingsDetails || "[]"),
        experienceDetails: JSON.parse(row.experiencedetails || row.experienceDetails || "[]"),
      }));
      res.json(applicants);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch applicants" });
    }
  });

  app.post("/api/applicants", async (req, res) => {
    const data = req.body;
    try {
      await query.run(`
        INSERT INTO applicants (
          id, fullName, fatherName, fatherEducation, fatherSalary, fatherEmployment, fatherMobile,
          motherName, motherEducation, motherSalary, motherEmployment, motherMobile,
          spouseName, spouseEducation, spouseSalary, spouseEmployment, spouseMobile,
          gender, dob, mobileNumber, emailId, permanentAddress, city, pincode,
          aadhaarNumber, panNumber, drivingLicenceNumber, bloodGroup, maritalStatus,
          numberOfKids, kidsDetails, numberOfSiblings, siblingsDetails,
          emergencyContactName, emergencyContactNumber, experienceType, positionApplied, branch, district, degreeType,
          instituteName, educationDetails, passedOutYear, numberOfCompanies,
          experienceDetails, currentSalary, expectedSalary, sourceOfApplication,
          sourceRemark, refererName, refererBranch, refererDesignation, refererEmpId,
          refererMobile, interviewScore, interviewRemarks, status, submittedBy, submittedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.id, data.fullName, data.fatherName, data.fatherEducation, data.fatherSalary, data.fatherEmployment, data.fatherMobile,
        data.motherName, data.motherEducation, data.motherSalary, data.motherEmployment, data.motherMobile,
        data.spouseName, data.spouseEducation, data.spouseSalary, data.spouseEmployment, data.spouseMobile,
        data.gender, data.dob, data.mobileNumber, data.emailId, data.permanentAddress, data.city, data.pincode,
        data.aadhaarNumber, data.panNumber, data.drivingLicenceNumber, data.bloodGroup, data.maritalStatus,
        data.numberOfKids, JSON.stringify(data.kidsDetails), data.numberOfSiblings, JSON.stringify(data.siblingsDetails),
        data.emergencyContactName, data.emergencyContactNumber, data.experienceType, data.positionApplied, data.branch, data.district, data.degreeType,
        data.instituteName, data.educationDetails, data.passedOutYear, data.numberOfCompanies,
        JSON.stringify(data.experienceDetails), data.currentSalary, data.expectedSalary, data.sourceOfApplication,
        data.sourceRemark, data.refererName, data.refererBranch, data.refererDesignation, data.refererEmpId,
        data.refererMobile, data.interviewScore, data.interviewRemarks, data.status, data.submittedBy, data.submittedAt
      ]);
      res.status(201).json({ message: "Applicant created" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create applicant" });
    }
  });

  app.put("/api/applicants/:id", async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
      await query.run(`
        UPDATE applicants SET
          fullName = ?, fatherName = ?, fatherEducation = ?, fatherSalary = ?, fatherEmployment = ?, fatherMobile = ?,
          motherName = ?, motherEducation = ?, motherSalary = ?, motherEmployment = ?, motherMobile = ?,
          spouseName = ?, spouseEducation = ?, spouseSalary = ?, spouseEmployment = ?, spouseMobile = ?,
          gender = ?, dob = ?, mobileNumber = ?, emailId = ?, permanentAddress = ?, city = ?, pincode = ?,
          aadhaarNumber = ?, panNumber = ?, drivingLicenceNumber = ?, bloodGroup = ?, maritalStatus = ?,
          numberOfKids = ?, kidsDetails = ?, numberOfSiblings = ?, siblingsDetails = ?,
          emergencyContactName = ?, emergencyContactNumber = ?, experienceType = ?, positionApplied = ?, branch = ?, district = ?, degreeType = ?,
          instituteName = ?, educationDetails = ?, passedOutYear = ?, numberOfCompanies = ?,
          experienceDetails = ?, currentSalary = ?, expectedSalary = ?, sourceOfApplication = ?,
          sourceRemark = ?, refererName = ?, refererBranch = ?, refererDesignation = ?, refererEmpId = ?,
          refererMobile = ?, interviewScore = ?, interviewRemarks = ?, status = ?,
          submittedBy = ?, submittedAt = ?
        WHERE id = ?
      `, [
        data.fullName, data.fatherName, data.fatherEducation, data.fatherSalary, data.fatherEmployment, data.fatherMobile,
        data.motherName, data.motherEducation, data.motherSalary, data.motherEmployment, data.motherMobile,
        data.spouseName, data.spouseEducation, data.spouseSalary, data.spouseEmployment, data.spouseMobile,
        data.gender, data.dob, data.mobileNumber, data.emailId, data.permanentAddress, data.city, data.pincode,
        data.aadhaarNumber, data.panNumber, data.drivingLicenceNumber, data.bloodGroup, data.maritalStatus,
        data.numberOfKids, JSON.stringify(data.kidsDetails), data.numberOfSiblings, JSON.stringify(data.siblingsDetails),
        data.emergencyContactName, data.emergencyContactNumber, data.experienceType, data.positionApplied, data.branch, data.district, data.degreeType,
        data.instituteName, data.educationDetails, data.passedOutYear, data.numberOfCompanies,
        JSON.stringify(data.experienceDetails), data.currentSalary, data.expectedSalary, data.sourceOfApplication,
        data.sourceRemark, data.refererName, data.refererBranch, data.refererDesignation, data.refererEmpId,
        data.refererMobile, data.interviewScore, data.interviewRemarks, data.status,
        data.submittedBy, data.submittedAt, id
      ]);
      res.json({ message: "Applicant updated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update applicant" });
    }
  });

  app.patch("/api/applicants/:id/evaluation", async (req, res) => {
    const { id } = req.params;
    const { interviewScore, interviewRemarks, status } = req.body;
    try {
      await query.run("UPDATE applicants SET interviewScore = ?, interviewRemarks = ?, status = ? WHERE id = ?", [interviewScore, interviewRemarks, status, id]);
      res.json({ message: "Evaluation updated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update evaluation" });
    }
  });

  app.delete("/api/applicants/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await query.run("DELETE FROM applicants WHERE id = ?", [id]);
      res.json({ message: "Applicant deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete applicant" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
