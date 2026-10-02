import { assertPasswordAllowed, recordPasswordChange } from "./identitySecurity.js";
export function createChangePasswordHandler({ db, bcrypt }) {
  return async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    // Fetch existing hash
    const result = await db(
      `
      SELECT id, password_hash
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];
    const passwordCheck = await assertPasswordAllowed(db, {
      companyId: req.user.companyId,
      userId: user.id,
      password: newPassword,
      bcrypt,
      enforceMinimumLifetime: true,
    });
    if (!passwordCheck.ok) {
      return res.status(400).json({ success: false, code: "PASSWORD_POLICY", message: passwordCheck.message });
    }

    const validCurrent = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );

    if (!validCurrent) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Reuse the same bcrypt hashing used at registration/login
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await db(
      `
      UPDATE users
      SET password_hash = $1
          , must_change_password = FALSE
      WHERE id = $2
      `,
      [newPasswordHash, user.id]
    );
    await recordPasswordChange(db, {
      companyId: req.user.companyId,
      userId: user.id,
      previousHash: user.password_hash,
      settings: passwordCheck.settings,
      revokeSessions: false,
      keepSessionId: req.user.sid || null,
    });

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to change password",
    });
  }
};
}
