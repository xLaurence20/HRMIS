import { pool, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

/* ================================================================== *
 *  Core: post a ledger entry and update the denormalized balance.
 *
 *  Must be called inside a transaction (conn is a connection with
 *  an active transaction). Uses SELECT ... FOR UPDATE on the balance
 *  row to serialize concurrent writes to the same employee+type.
 * ================================================================== */
export async function postLedgerEntry({
  employeeId,
  leaveTypeId,
  effectiveDate,
  transactionType,
  amount,
  referenceType = 'system',
  referenceId = null,
  remarks = null,
  createdBy = null,
  conn,
}) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt === 0) {
    throw new AppError('Ledger amount must be a non-zero number.', 400, 'VALIDATION_ERROR');
  }

  // 1. Lock the balance row (or note it doesn't exist yet)
  const [balRows] = await conn.query(
    `SELECT id, balance FROM leave_credit_balances
      WHERE employee_id = ? AND leave_type_id = ?
      FOR UPDATE`,
    [employeeId, leaveTypeId]
  );
  const existing = balRows[0] ?? null;
  const currentBalance = existing ? Number(existing.balance) : 0;
  const newBalance = Math.round((currentBalance + amt) * 1000) / 1000;

  // 2. Insert the ledger row (append-only)
  const [ins] = await conn.query(
    `INSERT INTO leave_credit_ledgers
       (employee_id, leave_type_id, effective_date, transaction_type,
        amount, running_balance, reference_type, reference_id, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employeeId, leaveTypeId, effectiveDate, transactionType,
      amt, newBalance, referenceType, referenceId, remarks, createdBy,
    ]
  );
  const ledgerId = ins.insertId;

  // 3. Recompute earned/used YTD from the ledger (cheap, always correct)
  const [[totals]] = await conn.query(
    `SELECT
       COALESCE(SUM(CASE WHEN amount > 0 AND YEAR(effective_date) = YEAR(?) THEN amount ELSE 0 END), 0) AS earned_ytd,
       COALESCE(SUM(CASE WHEN amount < 0 AND YEAR(effective_date) = YEAR(?) THEN -amount ELSE 0 END), 0) AS used_ytd
     FROM leave_credit_ledgers
     WHERE employee_id = ? AND leave_type_id = ?`,
    [effectiveDate, effectiveDate, employeeId, leaveTypeId]
  );

  // 4. Upsert the balance row
  if (existing) {
    await conn.query(
      `UPDATE leave_credit_balances SET
         balance             = ?,
         earned_ytd          = ?,
         used_ytd            = ?,
         last_transaction_id = ?,
         last_transaction_at = NOW()
       WHERE id = ?`,
      [newBalance, totals.earned_ytd, totals.used_ytd, ledgerId, existing.id]
    );
  } else {
    await conn.query(
      `INSERT INTO leave_credit_balances
         (employee_id, leave_type_id, balance, earned_ytd, used_ytd,
          last_transaction_id, last_transaction_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [employeeId, leaveTypeId, newBalance, totals.earned_ytd, totals.used_ytd, ledgerId]
    );
  }

  return { ledgerId, runningBalance: newBalance };
}

/* ================================================================== *
 *  Read current balance for an employee+type
 * ================================================================== */
export async function getBalance(employeeId, leaveTypeId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT balance, earned_ytd, used_ytd, last_transaction_at
       FROM leave_credit_balances
      WHERE employee_id = ? AND leave_type_id = ?`,
    [employeeId, leaveTypeId]
  );
  if (!rows[0]) {
    return { balance: 0, earnedYtd: 0, usedYtd: 0, lastTransactionAt: null };
  }
  return {
    balance: Number(rows[0].balance),
    earnedYtd: Number(rows[0].earned_ytd),
    usedYtd: Number(rows[0].used_ytd),
    lastTransactionAt: rows[0].last_transaction_at,
  };
}

/* ================================================================== *
 *  Get all balances for one employee
 * ================================================================== */
export async function getEmployeeBalances(employeeId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT b.leave_type_id, lt.code, lt.name, lt.color_hex,
            lt.is_credited, lt.is_encashable, lt.sort_order,
            b.balance, b.earned_ytd, b.used_ytd, b.last_transaction_at
       FROM leave_credit_balances b
       JOIN leave_types lt ON lt.id = b.leave_type_id
      WHERE b.employee_id = ?
      ORDER BY lt.sort_order, lt.code`,
    [employeeId]
  );
  return rows.map((r) => ({
    leaveTypeId: r.leave_type_id,
    code: r.code,
    name: r.name,
    colorHex: r.color_hex,
    isCredited: Boolean(r.is_credited),
    isEncashable: Boolean(r.is_encashable),
    balance: Number(r.balance),
    earnedYtd: Number(r.earned_ytd),
    usedYtd: Number(r.used_ytd),
    lastTransactionAt: r.last_transaction_at,
  }));
}

/* ================================================================== *
 *  Get ledger history with optional filters
 * ================================================================== */
export async function getLedger({
  employeeId, leaveTypeId = null, fromDate = null, toDate = null,
  transactionType = null, limit = 100, offset = 0, conn = pool,
}) {
  const where = ['lcl.employee_id = ?'];
  const params = [employeeId];

  if (leaveTypeId) { where.push('lcl.leave_type_id = ?'); params.push(leaveTypeId); }
  if (fromDate)    { where.push('lcl.effective_date >= ?'); params.push(fromDate); }
  if (toDate)      { where.push('lcl.effective_date <= ?'); params.push(toDate); }
  if (transactionType) { where.push('lcl.transaction_type = ?'); params.push(transactionType); }

  const [countRows] = await conn.query(
    `SELECT COUNT(*) AS total FROM leave_credit_ledgers lcl WHERE ${where.join(' AND ')}`,
    params
  );

  const [rows] = await conn.query(
    `SELECT lcl.id, lcl.employee_id, lcl.leave_type_id,
            lt.code AS leave_type_code, lt.name AS leave_type_name,
            lcl.effective_date, lcl.posted_at, lcl.transaction_type,
            lcl.amount, lcl.running_balance, lcl.reference_type, lcl.reference_id,
            lcl.remarks, lcl.created_by,
            u.username AS created_by_username
       FROM leave_credit_ledgers lcl
       JOIN leave_types lt ON lt.id = lcl.leave_type_id
       LEFT JOIN users u ON u.id = lcl.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY lcl.effective_date DESC, lcl.id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    ledger: rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      leaveTypeId: r.leave_type_id,
      leaveTypeCode: r.leave_type_code,
      leaveTypeName: r.leave_type_name,
      effectiveDate: r.effective_date,
      postedAt: r.posted_at,
      transactionType: r.transaction_type,
      amount: Number(r.amount),
      runningBalance: Number(r.running_balance),
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      remarks: r.remarks,
      createdBy: r.created_by,
      createdByUsername: r.created_by_username,
    })),
    total: Number(countRows[0].total),
  };
}

/* ================================================================== *
 *  Credit a leave application (deduct on final approval).
 *  Idempotent — safe to call twice; second call is a no-op.
 * ================================================================== */
export async function creditLeaveApplication(applicationId, actorUserId) {
  return withTransaction(async (conn) => {
    const [apps] = await conn.query(
      `SELECT la.id, la.employee_id, la.leave_type_id, la.total_days,
              la.status, la.credit_committed, la.application_number,
              lt.code AS leave_type_code, lt.is_credited,
              lt.allows_negative_balance
         FROM leave_applications la
         JOIN leave_types lt ON lt.id = la.leave_type_id
        WHERE la.id = ? AND la.deleted_at IS NULL
        FOR UPDATE`,
      [applicationId]
    );
    const app = apps[0];
    if (!app) throw new AppError('Application not found.', 404, 'NOT_FOUND');
    if (app.status !== 'approved') {
      throw new AppError('Only approved applications can commit credits.',
        409, 'INVALID_STATUS', { currentStatus: app.status });
    }
    if (app.credit_committed) {
      return { alreadyCommitted: true, deducted: 0 };
    }

    // Non-credited types (maternity, paternity, LWOP, etc.) — nothing to deduct.
    // Still mark as committed so we don't retry.
    if (!app.is_credited) {
      await conn.query(
        `UPDATE leave_applications
            SET credit_committed = 1, credit_committed_at = NOW(), credit_days_deducted = 0
          WHERE id = ?`,
        [applicationId]
      );
      return { deducted: 0, reason: 'type_not_credited' };
    }

    const days = Number(app.total_days);

    // Check available balance unless the type permits negatives
    if (!app.allows_negative_balance) {
      const bal = await getBalance(app.employee_id, app.leave_type_id, conn);
      if (bal.balance < days) {
        throw new AppError(
          `Insufficient ${app.leave_type_code} credits. ` +
          `Available: ${bal.balance.toFixed(3)} day(s), required: ${days.toFixed(2)} day(s).`,
          409, 'INSUFFICIENT_CREDITS',
          {
            leaveTypeCode: app.leave_type_code,
            available: bal.balance,
            required: days,
          }
        );
      }
    }

    // Post the deduction
    const { ledgerId, runningBalance } = await postLedgerEntry({
      employeeId: app.employee_id,
      leaveTypeId: app.leave_type_id,
      effectiveDate: new Date().toISOString().slice(0, 10),
      transactionType: 'deduction',
      amount: -days,
      referenceType: 'leave_application',
      referenceId: applicationId,
      remarks: `Approved leave — ${app.application_number}`,
      createdBy: actorUserId,
      conn,
    });

    // Mark application
    await conn.query(
      `UPDATE leave_applications
          SET credit_committed = 1,
              credit_committed_at = NOW(),
              credit_days_deducted = ?
        WHERE id = ?`,
      [days, applicationId]
    );

    // Audit trail
    await conn.query(
      `INSERT INTO leave_application_actions
         (application_id, actor_user_id, actor_stage, action, remarks, new_status)
       VALUES (?, ?, 'system', 'credit_committed', ?, 'approved')`,
      [
        applicationId, actorUserId,
        `Deducted ${days.toFixed(2)} day(s) from ${app.leave_type_code}. ` +
        `New balance: ${runningBalance.toFixed(3)}.`,
      ]
    );

    return { deducted: days, ledgerId, runningBalance };
  });
}

/* ================================================================== *
 *  Reverse credits when an approved application is cancelled.
 *  Creates a fresh adjustment_add entry — never deletes ledger rows.
 * ================================================================== */
export async function reverseCreditForApplication(applicationId, actorUserId, reason = null) {
  return withTransaction(async (conn) => {
    const [apps] = await conn.query(
      `SELECT la.id, la.employee_id, la.leave_type_id, la.total_days,
              la.credit_committed, la.credit_days_deducted, la.application_number,
              lt.code AS leave_type_code
         FROM leave_applications la
         JOIN leave_types lt ON lt.id = la.leave_type_id
        WHERE la.id = ? AND la.deleted_at IS NULL
        FOR UPDATE`,
      [applicationId]
    );
    const app = apps[0];
    if (!app) throw new AppError('Application not found.', 404, 'NOT_FOUND');
    if (!app.credit_committed) {
      return { reversed: 0, reason: 'not_committed' };
    }

    const days = Number(app.credit_days_deducted ?? app.total_days);
    if (days <= 0) {
      // Nothing to reverse
      await conn.query(
        `UPDATE leave_applications
            SET credit_committed = 0, credit_committed_at = NULL, credit_days_deducted = NULL
          WHERE id = ?`,
        [applicationId]
      );
      return { reversed: 0, reason: 'zero_days' };
    }

    const { ledgerId, runningBalance } = await postLedgerEntry({
      employeeId: app.employee_id,
      leaveTypeId: app.leave_type_id,
      effectiveDate: new Date().toISOString().slice(0, 10),
      transactionType: 'adjustment_add',
      amount: days,
      referenceType: 'leave_application',
      referenceId: applicationId,
      remarks: reason || `Reversal — cancelled application ${app.application_number}`,
      createdBy: actorUserId,
      conn,
    });

    await conn.query(
      `UPDATE leave_applications
          SET credit_committed = 0,
              credit_committed_at = NULL,
              credit_days_deducted = NULL
        WHERE id = ?`,
      [applicationId]
    );

    await conn.query(
      `INSERT INTO leave_application_actions
         (application_id, actor_user_id, actor_stage, action, remarks, new_status)
       VALUES (?, ?, 'system', 'credit_reversed', ?, NULL)`,
      [
        applicationId, actorUserId,
        `Restored ${days.toFixed(2)} day(s) of ${app.leave_type_code}. ` +
        `New balance: ${runningBalance.toFixed(3)}.`,
      ]
    );

    return { reversed: days, ledgerId, runningBalance };
  });
}

/* ================================================================== *
 *  Manual adjustment (HR/Admin action)
 * ================================================================== */
export async function adjustBalance({
  employeeId, leaveTypeId, amount, reason, actorUserId, effectiveDate,
}) {
  if (!reason || reason.trim().length < 5) {
    throw new AppError('A reason of at least 5 characters is required for adjustments.',
      400, 'VALIDATION_ERROR');
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt === 0) {
    throw new AppError('Adjustment amount must be a non-zero number.', 400, 'VALIDATION_ERROR');
  }

  return withTransaction(async (conn) => {
    // Validate employee and type exist
    const [emp] = await conn.query(
      'SELECT id, full_name FROM employees WHERE id = ? AND deleted_at IS NULL',
      [employeeId]
    );
    if (!emp[0]) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

    const [lt] = await conn.query(
      'SELECT id, code, name FROM leave_types WHERE id = ? AND deleted_at IS NULL',
      [leaveTypeId]
    );
    if (!lt[0]) throw new AppError('Leave type not found.', 404, 'NOT_FOUND');

    const { ledgerId, runningBalance } = await postLedgerEntry({
      employeeId,
      leaveTypeId,
      effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
      transactionType: amt > 0 ? 'adjustment_add' : 'adjustment_deduct',
      amount: amt,
      referenceType: 'manual',
      remarks: reason.trim(),
      createdBy: actorUserId,
      conn,
    });

    return {
      employeeId,
      employeeName: emp[0].full_name,
      leaveTypeCode: lt[0].code,
      leaveTypeName: lt[0].name,
      amount: amt,
      ledgerId,
      newBalance: runningBalance,
    };
  });
}

/* ================================================================== *
 *  Monthly accrual run.
 *  Idempotent per (employee, type, year, month) — safe to re-run.
 * ================================================================== */
export async function postMonthlyAccrual(year, month, actorUserId) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError('Invalid year.', 400, 'VALIDATION_ERROR');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError('Invalid month.', 400, 'VALIDATION_ERROR');
  }

  return withTransaction(async (conn) => {
    // Find monthly-accrual credited leave types
    const [types] = await conn.query(
      `SELECT id, code, name, accrual_amount, max_balance_cap
         FROM leave_types
        WHERE is_credited = 1
          AND accrual_method = 'monthly'
          AND is_active = 1
          AND deleted_at IS NULL`,
    );

    if (!types.length) {
      return { effectiveDate: `${year}-${String(month).padStart(2, '0')}-01`, results: [] };
    }

    // Active employees only
    const [emps] = await conn.query(
      `SELECT id, employee_number, full_name
         FROM employees
        WHERE is_active = 1 AND deleted_at IS NULL`,
    );

    const effectiveDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const results = [];

    for (const lt of types) {
      let accrued = 0;
      let skippedDuplicate = 0;
      let skippedCapped = 0;

      for (const e of emps) {
        // Idempotency check
        const [exists] = await conn.query(
          `SELECT id FROM leave_credit_ledgers
            WHERE employee_id = ? AND leave_type_id = ?
              AND transaction_type = 'accrual'
              AND YEAR(effective_date) = ? AND MONTH(effective_date) = ?`,
          [e.id, lt.id, year, month]
        );
        if (exists.length) { skippedDuplicate++; continue; }

        const bal = await getBalance(e.id, lt.id, conn);
        let amount = Number(lt.accrual_amount);

        // Respect cap if set
        if (lt.max_balance_cap !== null) {
          const cap = Number(lt.max_balance_cap);
          if (bal.balance >= cap) { skippedCapped++; continue; }
          if (bal.balance + amount > cap) amount = cap - bal.balance;
        }

        if (amount <= 0) { skippedCapped++; continue; }

        await postLedgerEntry({
          employeeId: e.id,
          leaveTypeId: lt.id,
          effectiveDate,
          transactionType: 'accrual',
          amount,
          referenceType: 'system',
          remarks: `Monthly accrual — ${year}-${String(month).padStart(2, '0')}`,
          createdBy: actorUserId,
          conn,
        });
        accrued++;
      }

      results.push({
        leaveTypeId: lt.id,
        code: lt.code,
        name: lt.name,
        amountPerEmployee: Number(lt.accrual_amount),
        employeesAccrued: accrued,
        skippedDuplicate,
        skippedCapped,
      });
    }

    return { effectiveDate, results };
  });
}

/* ================================================================== *
 *  Yearly accrual run (for SPL, Solo Parent, etc.)
 * ================================================================== */
export async function postAnnualAccrual(year, actorUserId) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError('Invalid year.', 400, 'VALIDATION_ERROR');
  }

  return withTransaction(async (conn) => {
    const [types] = await conn.query(
      `SELECT id, code, name, accrual_amount, max_balance_cap
         FROM leave_types
        WHERE is_credited = 1
          AND accrual_method = 'annual'
          AND is_active = 1
          AND deleted_at IS NULL`,
    );

    if (!types.length) {
      return { effectiveDate: `${year}-01-01`, results: [] };
    }

    const [emps] = await conn.query(
      `SELECT id FROM employees WHERE is_active = 1 AND deleted_at IS NULL`,
    );

    const effectiveDate = `${year}-01-01`;
    const results = [];

    for (const lt of types) {
      let accrued = 0;
      let skippedDuplicate = 0;
      let skippedCapped = 0;

      for (const e of emps) {
        const [exists] = await conn.query(
          `SELECT id FROM leave_credit_ledgers
            WHERE employee_id = ? AND leave_type_id = ?
              AND transaction_type = 'accrual'
              AND YEAR(effective_date) = ?`,
          [e.id, lt.id, year]
        );
        if (exists.length) { skippedDuplicate++; continue; }

        const bal = await getBalance(e.id, lt.id, conn);
        let amount = Number(lt.accrual_amount);

        // Annual types usually reset, not accumulate.
        // Simplest model for Phase 4: only grant if current balance < amount,
        // and top up to the annual amount.
        if (bal.balance >= amount) { skippedCapped++; continue; }
        amount = amount - bal.balance;

        if (amount <= 0) { skippedCapped++; continue; }

        await postLedgerEntry({
          employeeId: e.id,
          leaveTypeId: lt.id,
          effectiveDate,
          transactionType: 'accrual',
          amount,
          referenceType: 'system',
          remarks: `Annual accrual — ${year}`,
          createdBy: actorUserId,
          conn,
        });
        accrued++;
      }

      results.push({
        leaveTypeId: lt.id,
        code: lt.code,
        name: lt.name,
        amountPerEmployee: Number(lt.accrual_amount),
        employeesAccrued: accrued,
        skippedDuplicate,
        skippedCapped,
      });
    }

    return { effectiveDate, results };
  });
}