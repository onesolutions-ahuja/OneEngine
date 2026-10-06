import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

/*
 * POST /api/customer-auth/login
 * Customer-facing login (separate from admin/staff login).
 * Uses the existing customers table and company-scoped JWT.
 */
router.post("/customer-auth/login", async (req, res) => {
  const { pool } = req.app.locals;
  if (!pool) {
    return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
  }

  try {
    const { phone, email, password } = req.body;

    if ((!phone && !email) || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone or email and password are required"
      });
    }

    const identifiers = [phone, email].filter((v) => v && String(v).trim());
    if (!identifiers.length) {
      return res.status(400).json({ success: false, message: "Phone or email required" });
    }

    const query = `
      SELECT c.id, c.company_id, c.name, c.phone, c.email, c.password_hash, c.active
      FROM customers c
      WHERE c.company_id = $1
        AND c.active = true
        AND (c.phone = ANY($2::text[]) OR LOWER(c.email) = ANY($3::text[]))
      LIMIT 1
    `;

    const result = await pool.query(query, [
      req.body.companyId || null, // Will be set from token if provided
      identifiers.map((v) => String(v).trim()),
      identifiers.map((v) => String(v).trim().toLowerCase())
    ]);

    // If companyId not provided, we need to find by phone/email across companies
    if (!req.body.companyId) {
      const crossCompanyQuery = `
        SELECT c.id, c.company_id, c.name, c.phone, c.email, c.password_hash, c.active
        FROM customers c
        WHERE c.active = true
          AND (c.phone = ANY($1::text[]) OR LOWER(c.email) = ANY($2::text[]))
        LIMIT 1
      `;
      const crossResult = await pool.query(crossCompanyQuery, [
        identifiers.map((v) => String(v).trim()),
        identifiers.map((v) => String(v).trim().toLowerCase())
      ]);

      if (crossResult.rows.length) {
        const customer = crossResult.rows[0];
        const passwordValid = await bcrypt.compare(password, customer.password_hash);
        if (!passwordValid) {
          return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        if (!customer.active) {
          return res.status(403).json({ success: false, message: "Account disabled" });
        }

        const token = jwt.sign(
          {
            customerId: customer.id,
            companyId: customer.company_id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email
          },
          process.env.JWT_SECRET,
          { expiresIn: "30d" }
        );

        return res.json({
          success: true,
          token,
          customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            companyId: customer.company_id
          }
        });
      }

      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Single company mode (token provided)
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const customer = result.rows[0];
    const passwordValid = await bcrypt.compare(password, customer.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    if (!customer.active) {
      return res.status(403).json({ success: false, message: "Account disabled" });
    }

    const token = jwt.sign(
      {
        customerId: customer.id,
        companyId: customer.company_id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        companyId: customer.company_id
      }
    });
  } catch (error) {
    console.error("Customer login error:", error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

/*
 * Customer registration is a business record-creation process and is intentionally
 * not implemented in this technical authentication adapter. Registration is owned
 * by Customer metadata + Flow and invoked through the generic metadata runtime.
 */
/*
 * GET /api/customer-auth/me
 * Get current customer profile from token
 */
router.get("/customer-auth/me", async (req, res) => {
  const { pool } = req.app.locals;
  if (!pool) {
    return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
  }

  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const token = header.substring(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "Invalid or expired session" });
    }

    if (!decoded.customerId) {
      return res.status(401).json({ success: false, message: "Invalid customer token" });
    }

    const result = await pool.query(
      `SELECT id, name, phone, email, company_id, active, created_at
       FROM customers WHERE id = $1 AND active = true`,
      [decoded.customerId]
    );

    if (!result.rows.length) {
      return res.status(401).json({ success: false, message: "Customer not found" });
    }

    const customer = result.rows[0];
    res.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        companyId: customer.company_id,
        createdAt: customer.created_at
      }
    });
  } catch (error) {
    console.error("Customer me error:", error);
    res.status(500).json({ success: false, message: "Unable to load profile" });
  }
});


export default router;