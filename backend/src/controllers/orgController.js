import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/request.js';

/* ================================================================== *
 *  GET /api/org/tree
 *
 *  Returns a nested structure:
 *    {
 *      id, code, name, officeType, isActive,
 *      head: { id, fullName, positionTitle } | null,
 *      employeeCount,
 *      employees: [{ id, fullName, positionTitle, employmentStatus }],
 *      children: [ ...same shape... ]
 *    }
 * ================================================================== */
export const getOrgTree = asyncHandler(async (_req, res) => {
  const [departments] = await pool.query(
    `SELECT d.id, d.code, d.name, d.short_name, d.parent_id, d.office_type,
            d.sort_order, d.is_active, d.head_employee_id,
            h.full_name AS head_full_name,
            hp.title    AS head_position_title
       FROM departments d
       LEFT JOIN employees h  ON h.id = d.head_employee_id
       LEFT JOIN positions hp ON hp.id = h.position_id
      WHERE d.deleted_at IS NULL
      ORDER BY d.sort_order ASC, d.name ASC`
  );

  const [employees] = await pool.query(
    `SELECT e.id, e.full_name, e.employee_number, e.employment_status,
            e.department_id, p.title AS position_title
       FROM employees e
       LEFT JOIN positions p ON p.id = e.position_id
      WHERE e.deleted_at IS NULL AND e.is_active = 1
      ORDER BY e.last_name, e.first_name`
  );

  // Group employees by department id
  const employeesByDept = new Map();
  for (const e of employees) {
    if (!employeesByDept.has(e.department_id)) employeesByDept.set(e.department_id, []);
    employeesByDept.get(e.department_id).push({
      id: e.id,
      fullName: e.full_name,
      employeeNumber: e.employee_number,
      positionTitle: e.position_title,
      employmentStatus: e.employment_status,
    });
  }

  // Build node map
  const nodes = new Map();
  for (const d of departments) {
    nodes.set(d.id, {
      id: d.id,
      code: d.code,
      name: d.name,
      shortName: d.short_name,
      parentId: d.parent_id,
      officeType: d.office_type,
      sortOrder: d.sort_order,
      isActive: Boolean(d.is_active),
      head: d.head_employee_id
        ? {
            id: d.head_employee_id,
            fullName: d.head_full_name,
            positionTitle: d.head_position_title,
          }
        : null,
      employees: employeesByDept.get(d.id) ?? [],
      employeeCount: (employeesByDept.get(d.id) ?? []).length,
      children: [],
    });
  }

  // Wire parent -> child
  const roots = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Roll up employee counts from children into parents
  function rollup(node) {
    let total = node.employeeCount;
    for (const child of node.children) total += rollup(child);
    node.totalEmployees = total;
    return total;
  }
  roots.forEach(rollup);

  return ok(res, {
    tree: roots,
    totals: {
      departments: departments.length,
      employees: employees.length,
      activeDepartments: departments.filter((d) => d.is_active).length,
    },
  });
});