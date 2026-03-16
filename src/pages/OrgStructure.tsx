import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import dagre from 'dagre';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Building2, Loader2, Maximize2, ExternalLink, User, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';

import '@xyflow/react/dist/style.css';

const PERSON_NODE_WIDTH = 180;
const PERSON_NODE_HEIGHT = 72;
const CEO_NODE_WIDTH = 220;
const CEO_NODE_HEIGHT = 92;
const DEPT_NODE_WIDTH = 220;
const DEPT_NODE_HEIGHT = 88;

function getNodeDimensions(node: Node): { width: number; height: number } {
  const type = node.type || 'department';
  if (type === 'person') {
    return node.data?.isCeo ? { width: CEO_NODE_WIDTH, height: CEO_NODE_HEIGHT } : { width: PERSON_NODE_WIDTH, height: PERSON_NODE_HEIGHT };
  }
  return { width: DEPT_NODE_WIDTH, height: DEPT_NODE_HEIGHT };
}

function getLayoutedElements(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'TB') {
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 150, ranksep: 90, edgesep: 40 });

  nodes.forEach((node) => {
    const { width, height } = getNodeDimensions(node);
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const { width, height } = getNodeDimensions(node);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

const ROLE_LABELS: Record<string, string> = {
  executive: 'Executive',
  super_admin: 'Admin',
  admin: 'Admin',
  manager: 'Manager',
  supervisor: 'Supervisor',
  employee: 'Employee',
  intern: 'Intern',
};

const ROLE_STYLES: Record<string, string> = {
  executive: 'bg-primary/20 text-black border-primary/40',
  manager: 'bg-teal-100 text-black border-teal-200 dark:bg-teal-900/40 dark:border-teal-700',
  supervisor: 'bg-blue-100 text-black border-blue-200 dark:bg-blue-900/40 dark:border-blue-700',
  employee: 'bg-muted text-black border-border',
  intern: 'bg-amber-50 text-black border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
};

function PersonNode({
  data,
  selected,
}: {
  data: { name: string; position?: string; role: string; roleLabel: string; isCeo: boolean; avatar_url?: string | null };
  selected?: boolean;
}) {
  const { name, position, roleLabel, isCeo, avatar_url } = data;
  const roleStyle = ROLE_STYLES[data.role] || ROLE_STYLES.employee;
  return (
    <div
      className={`
        flex flex-col min-w-[160px] rounded-xl border-2 bg-background shadow-md transition-all duration-200
        hover:shadow-lg hover:border-primary/40
        ${selected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-border'}
        ${isCeo ? 'bg-muted border-primary/30 shadow-lg' : ''}
      `}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={avatar_url ?? undefined} alt="" />
          <AvatarFallback className={isCeo ? 'bg-primary/20 text-primary text-xs' : 'bg-muted text-muted-foreground text-xs'}>
            {name.split(' ').map((n) => n[0]).join('').slice(0, 2) || <User className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-sm text-black truncate block">{name}</span>
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${roleStyle}`}>
            {roleLabel}
          </span>
        </div>
      </div>
      {position && (
        <div className="px-3 py-1.5">
          <p className="text-xs text-black truncate">{position}</p>
        </div>
      )}
    </div>
  );
}

function DepartmentNode({
  data,
  selected,
}: {
  data: {
    name: string;
    headName?: string;
    empCount: number;
    isRoot: boolean;
    hasMembers?: boolean;
    isExpanded?: boolean;
    onToggle?: () => void;
  };
  selected?: boolean;
}) {
  const { name, headName, empCount, isRoot, hasMembers, isExpanded, onToggle } = data;
  return (
    <div
      className={`
        flex flex-col min-w-[200px] rounded-xl border-2 bg-background shadow-md transition-all duration-200
        hover:shadow-lg hover:border-primary/40
        ${selected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-border'}
        ${isRoot ? 'bg-muted border-primary/30' : ''}
      `}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-sm text-black truncate flex-1">{name}</span>
        {hasMembers && onToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="shrink-0 h-7 w-7 rounded-md border border-border bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            title={isExpanded ? 'Collapse to hide team' : 'Expand to show team'}
          >
            {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        )}
      </div>
      <div className="px-4 py-2 space-y-1">
        {headName && (
          <p className="text-xs text-black truncate">Head: {headName}</p>
        )}
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-black">
            {empCount} employee{empCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { department: DepartmentNode, person: PersonNode };

interface DepartmentHead {
  id: string;
  first_name: string;
  last_name: string;
}

interface Department {
  id: string;
  name: string;
  head_id: string | null;
  parent_department_id: string | null;
  head: DepartmentHead | null;
}

interface EmployeeWithMeta {
  id: string;
  first_name: string;
  last_name: string;
  position?: string | null;
  position_id?: string | null;
  employment_status_id?: string | null;
  avatar_url?: string | null;
  supervisor_id: string | null;
  supervisorIds: string[];
  user_roles: { role: string }[];
  departmentIds: string[];
  positionName?: string;
  employmentStatusName?: string;
}

const ROLE_ORDER = ['executive', 'super_admin', 'admin', 'manager', 'supervisor', 'employee', 'intern'] as const;

/** Highest role (for ranking/sorting in org chart). */
function getPrimaryRole(emp: EmployeeWithMeta): string {
  const roles = emp.user_roles?.map((r) => r.role) ?? [];
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? 'employee';
}

/** Most specific role for display. Uses user_roles, with fallback to position/employment_status from DB. */
function getDisplayRole(emp: EmployeeWithMeta): string {
  const pos = (emp.positionName || '').toLowerCase();
  const status = (emp.employmentStatusName || '').toLowerCase();
  if (pos === 'intern' || status === 'internship') return 'intern';

  const roles = emp.user_roles?.map((r) => r.role) ?? [];
  let best = 'employee';
  let bestIdx = -1;
  for (const r of roles) {
    const idx = ROLE_ORDER.indexOf(r as (typeof ROLE_ORDER)[number]);
    if (idx >= 0 && idx > bestIdx) {
      bestIdx = idx;
      best = r;
    }
  }
  return best;
}

function sortByRoleRank(emps: EmployeeWithMeta[]): EmployeeWithMeta[] {
  return [...emps].sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(getPrimaryRole(a) as (typeof ROLE_ORDER)[number]);
    const ib = ROLE_ORDER.indexOf(getPrimaryRole(b) as (typeof ROLE_ORDER)[number]);
    return ia - ib;
  });
}

/** When employee has 2+ supervisors (e.g. Dept Head + Supervisor), use 2nd-to-highest for org chart placement. */
function getChartSupervisorId(emp: EmployeeWithMeta, employees: EmployeeWithMeta[]): string | null {
  const ids = emp.supervisorIds;
  if (!ids.length) return emp.supervisor_id;
  if (ids.length === 1) return ids[0];
  const supervisors = ids
    .map((id) => employees.find((e) => e.id === id))
    .filter(Boolean) as EmployeeWithMeta[];
  const byRole = sortByRoleRank(supervisors);
  return byRole.length >= 2 ? byRole[1].id : byRole[0]?.id ?? null;
}

function OrgStructureFlowInner() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithMeta[]>([]);
  const [employeeCounts, setEmployeeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(() => new Set());
  const reactFlowInstance = useReactFlow();

  const toggleDept = useCallback((deptId: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (reactFlowInstance) {
      const t = setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 150);
      return () => clearTimeout(t);
    }
  }, [expandedDepts, reactFlowInstance]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [deptRes, empRes, roleRes, edRes, esRes, posRes, statusRes] = await Promise.all([
      supabase
        .from('departments')
        .select('*, head:employees!head_id(id, first_name, last_name)')
        .order('name'),
      supabase.from('employees').select('id, first_name, last_name, position, position_id, employment_status_id, supervisor_id, avatar_url').eq('is_active', true),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('employee_departments').select('employee_id, department_id'),
      supabase.from('employee_supervisors').select('employee_id, supervisor_id'),
      supabase.from('positions').select('id, name'),
      supabase.from('employment_statuses').select('id, name'),
    ]);

    if (deptRes.error) {
      toast.error('Failed to load departments');
    }
    if (empRes.error) {
      toast.error('Failed to load employees');
    }

    setDepartments(deptRes.data || []);

    const roleMap = new Map<string, { role: string }[]>();
    (roleRes.data || []).forEach((r) => {
      const arr = roleMap.get(r.user_id) || [];
      arr.push({ role: r.role });
      roleMap.set(r.user_id, arr);
    });

    const empDeptMap = new Map<string, string[]>();
    (edRes.data || []).forEach((ed: { employee_id: string; department_id: string }) => {
      const arr = empDeptMap.get(ed.employee_id) || [];
      arr.push(ed.department_id);
      empDeptMap.set(ed.employee_id, arr);
    });

    const empSupervisorMap = new Map<string, string[]>();
    (esRes.data || []).forEach((es: { employee_id: string; supervisor_id: string }) => {
      const arr = empSupervisorMap.get(es.employee_id) || [];
      arr.push(es.supervisor_id);
      empSupervisorMap.set(es.employee_id, arr);
    });

    const counts: Record<string, number> = {};
    (edRes.data || []).forEach((ed: { employee_id: string; department_id: string }) => {
      counts[ed.department_id] = (counts[ed.department_id] || 0) + 1;
    });
    setEmployeeCounts(counts);

    const positionMap = new Map<string, string>((posRes.data || []).map((p) => [p.id, p.name]));
    const statusMap = new Map<string, string>((statusRes.data || []).map((s) => [s.id, s.name]));
    const emps: EmployeeWithMeta[] = (empRes.data || []).map((e) => {
      const positionName = e.position?.trim() || (e.position_id && positionMap.get(e.position_id)) || '';
      const employmentStatusName = e.employment_status_id ? statusMap.get(e.employment_status_id) || '' : '';
      const fromJunction = empSupervisorMap.get(e.id) || [];
      const withPrimary = e.supervisor_id && !fromJunction.includes(e.supervisor_id)
        ? [...fromJunction, e.supervisor_id]
        : fromJunction;
      return {
        ...e,
        supervisorIds: withPrimary,
        user_roles: roleMap.get(e.id) || [],
        departmentIds: empDeptMap.get(e.id) || [],
        positionName,
        employmentStatusName,
      };
    });
    setEmployees(emps);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { initialNodes, initialEdges } = useMemo(() => {
    const getPositionName = (e: EmployeeWithMeta) =>
      (e.positionName || '').toLowerCase();
    const isCeoPosition = (e: EmployeeWithMeta) => getPositionName(e) === 'ceo';
    const hasNoChartSupervisor = (e: EmployeeWithMeta) =>
      getChartSupervisorId(e, employees) === null;
    const ceo =
      employees.find(isCeoPosition) ?? employees.find(hasNoChartSupervisor);
    const topLevelDepts = departments.filter((d) => !d.parent_department_id);
    const childrenOfDept = new Map<string, Department[]>();
    departments.forEach((d) => {
      const pid = d.parent_department_id || '_root';
      if (!childrenOfDept.has(pid)) childrenOfDept.set(pid, []);
      childrenOfDept.get(pid)!.push(d);
    });

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const isExpanded = (deptId: string) => expandedDepts.has(deptId);

    const addPersonNode = (emp: EmployeeWithMeta, isCeo = false, scopeDeptId?: string) => {
      const nodeId = scopeDeptId ? `person-${emp.id}-${scopeDeptId}` : `person-${emp.id}`;
      const role = getDisplayRole(emp);
      const roleLabel = isCeo ? 'CEO' : (ROLE_LABELS[role] || role);
      if (nodes.some((n) => n.id === nodeId)) return;
      nodes.push({
        id: nodeId,
        type: 'person',
        position: { x: 0, y: 0 },
        data: {
          name: `${emp.first_name} ${emp.last_name}`,
          position: emp.positionName || emp.position || undefined,
          role,
          roleLabel,
          isCeo,
          avatar_url: emp.avatar_url ?? null,
        },
      });
    };

    const addDeptSubtree = (dept: Department, parentId: string) => {
      const deptId = dept.id;
      const head = dept.head_id ? employees.find((e) => e.id === dept.head_id) : null;
      const empCount = employeeCounts[deptId] || 0;

      const getAllChildDeptIds = (d: Department): Set<string> => {
        const set = new Set<string>([d.id]);
        (childrenOfDept.get(d.id) || []).forEach((child) => {
          getAllChildDeptIds(child).forEach((id) => set.add(id));
        });
        return set;
      };
      const allDeptIds = getAllChildDeptIds(dept);
      const headInDept = head && (head.departmentIds.length === 0 || head.departmentIds.some((did) => allDeptIds.has(did)));
      const orphansInDept = employees.filter(
        (e) =>
          e.departmentIds.some((did) => allDeptIds.has(did)) &&
          getChartSupervisorId(e, employees) === null
      );
      const hasMembers = headInDept || orphansInDept.length > 0;

      nodes.push({
        id: deptId,
        type: 'department',
        position: { x: 0, y: 0 },
        data: {
          name: dept.name,
          headName: dept.head ? `${dept.head.first_name} ${dept.head.last_name}` : undefined,
          empCount,
          isRoot: !dept.parent_department_id,
          hasMembers,
          isExpanded: isExpanded(deptId),
          onToggle: hasMembers ? () => toggleDept(deptId) : undefined,
        },
      });
      edges.push({
        id: `${parentId}-${deptId}`,
        source: parentId,
        target: deptId,
        type: 'smoothstep',
        style: { stroke: '#333', strokeWidth: 3 },
      });

      if (isExpanded(deptId)) {
        const scopeDeptId = deptId;
        const addReportsUnder = (supervisorId: string, parentNodeId: string, inDeptIds: Set<string>) => {
          const reports = sortByRoleRank(
            employees.filter(
              (e) =>
                getChartSupervisorId(e, employees) === supervisorId &&
                e.departmentIds.some((did) => inDeptIds.has(did))
            )
          );
          reports.forEach((emp) => {
            const nodeId = `person-${emp.id}-${scopeDeptId}`;
            if (!nodes.some((n) => n.id === nodeId)) {
              addPersonNode(emp, false, scopeDeptId);
              edges.push({
                id: `${parentNodeId}-${nodeId}`,
                source: parentNodeId,
                target: nodeId,
                type: 'smoothstep',
                style: { stroke: '#333', strokeWidth: 3 },
              });
              addReportsUnder(emp.id, nodeId, inDeptIds);
            }
          });
        };

        if (headInDept) {
          const headNodeId = `person-${head.id}-${scopeDeptId}`;
          addPersonNode(head, false, scopeDeptId);
          edges.push({
            id: `${deptId}-${headNodeId}`,
            source: deptId,
            target: headNodeId,
            type: 'smoothstep',
            style: { stroke: '#333', strokeWidth: 3 },
          });
          addReportsUnder(head.id, headNodeId, allDeptIds);
        } else {
          sortByRoleRank(orphansInDept).forEach((emp) => {
            const nodeId = `person-${emp.id}-${scopeDeptId}`;
            if (!nodes.some((n) => n.id === nodeId)) {
              const role = getDisplayRole(emp);
              nodes.push({
                id: nodeId,
                type: 'person',
                position: { x: 0, y: 0 },
                data: {
                  name: `${emp.first_name} ${emp.last_name}`,
                  position: emp.position ?? undefined,
                  role,
                  roleLabel: ROLE_LABELS[role] || role,
                  isCeo: false,
                  avatar_url: emp.avatar_url ?? null,
                },
              });
              edges.push({
                id: `${deptId}-${nodeId}`,
                source: deptId,
                target: nodeId,
                type: 'smoothstep',
                style: { stroke: '#333', strokeWidth: 3 },
              });
            }
          });
        }
      }

      (childrenOfDept.get(deptId) || []).forEach((child) => addDeptSubtree(child, deptId));
    };

    if (ceo) {
      const ceoNodeId = `person-${ceo.id}`;
      addPersonNode(ceo, true);
      const ceoData = nodes.find((n) => n.id === ceoNodeId);
      if (ceoData) (ceoData.data as Record<string, unknown>).isCeo = true;

      topLevelDepts.forEach((d) => addDeptSubtree(d, ceoNodeId));
    } else if (topLevelDepts.length > 0) {
      const rootId = '_root';
      nodes.push({
        id: rootId,
        type: 'person',
        position: { x: 0, y: 0 },
        data: { name: 'CEO', position: undefined, role: 'executive', roleLabel: 'CEO', isCeo: true },
      });
      topLevelDepts.forEach((d) => addDeptSubtree(d, rootId));
    } else if (departments.length > 0) {
      const rootId = '_root';
      nodes.push({
        id: rootId,
        type: 'person',
        position: { x: 0, y: 0 },
        data: { name: 'CEO', position: undefined, role: 'executive', roleLabel: 'CEO', isCeo: true },
      });
      departments.filter((d) => !d.parent_department_id).forEach((d) => addDeptSubtree(d, rootId));
    }

    if (nodes.length === 0 && departments.length > 0) {
      const deptMap = new Map(departments.map((d) => [d.id, d]));
      const childrenOf = new Map<string, string[]>();
      departments.forEach((d) => {
        const parentId = d.parent_department_id || '_root';
        if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
        childrenOf.get(parentId)!.push(d.id);
      });
      departments.forEach((d) => {
        nodes.push({
          id: d.id,
          type: 'department',
          position: { x: 0, y: 0 },
          data: {
            name: d.name,
            headName: d.head ? `${d.head.first_name} ${d.head.last_name}` : undefined,
            empCount: employeeCounts[d.id] || 0,
            isRoot: !d.parent_department_id,
          },
        });
      });
      departments.forEach((d) => {
        if (d.parent_department_id) {
          edges.push({
            id: `${d.parent_department_id}-${d.id}`,
            source: d.parent_department_id,
            target: d.id,
            type: 'smoothstep',
            style: { stroke: '#333', strokeWidth: 3 },
          });
        }
      });
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [departments, employees, employeeCounts, expandedDepts, toggleDept]);

  const layouted = useMemo(() => {
    if (initialNodes.length === 0) return { nodes: [], edges: [] };
    return getLayoutedElements(initialNodes, initialEdges, 'TB');
  }, [initialNodes, initialEdges]);

  const [nodesState, setNodesState, onNodesChangeHandler] = useNodesState(
    layouted.nodes.map((n) => ({
      ...n,
      draggable: n.type === 'department',
    }))
  );
  const [edgesState, setEdgesState, onEdgesChangeHandler] = useEdgesState(layouted.edges);

  useEffect(() => {
    setNodesState(
      layouted.nodes.map((n) => ({
        ...n,
        draggable: n.type === 'department',
      }))
    );
    setEdgesState(layouted.edges);
  }, [layouted.nodes, layouted.edges, setNodesState, setEdgesState]);

  const getDescendantIds = useCallback(
    (id: string): Set<string> => {
      const set = new Set<string>();
      const queue = [id];
      const childrenMap = new Map<string, string[]>();
      departments.forEach((d) => {
        if (d.parent_department_id) {
          const arr = childrenMap.get(d.parent_department_id) || [];
          arr.push(d.id);
          childrenMap.set(d.parent_department_id, arr);
        }
      });
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const children = childrenMap.get(curr) || [];
        children.forEach((c) => {
          if (!set.has(c)) {
            set.add(c);
            queue.push(c);
          }
        });
      }
      return set;
    },
    [departments]
  );

  const onNodeDragStop = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      if (!reactFlowInstance || savingId || node.type !== 'department') return;
      const intersecting = reactFlowInstance.getIntersectingNodes(node).filter((n) => n.id !== node.id);
      const target = intersecting[0];
      if (!target) return;

      const draggedDept = departments.find((d) => d.id === node.id);
      if (!draggedDept) return;

      const newParentId = target.id.startsWith('person-') || target.id === '_root' ? null : target.id;
      if (newParentId === draggedDept.parent_department_id) return;
      if (newParentId !== null && node.id === newParentId) return;
      const descendants = getDescendantIds(node.id);
      if (descendants.has(newParentId)) {
        toast.error('Cannot make a department a child of its own descendant');
        return;
      }

      setSavingId(node.id);
      const prevParent = draggedDept.parent_department_id;
      setDepartments((prev) =>
        prev.map((d) => (d.id === node.id ? { ...d, parent_department_id: newParentId } : d))
      );

      const { error } = await supabase
        .from('departments')
        .update({ parent_department_id: newParentId })
        .eq('id', node.id);

      if (error) {
        toast.error(error.message || 'Failed to update hierarchy');
        setDepartments((prev) =>
          prev.map((d) => (d.id === node.id ? { ...d, parent_department_id: prevParent } : d))
        );
      } else {
        toast.success(`Moved "${draggedDept.name}" under "${(target.data?.name as string) || ''}"`);
      }
      setSavingId(null);
    },
    [departments, reactFlowInstance, savingId, getDescendantIds]
  );

  const onFitView = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.2 });
  }, [reactFlowInstance]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (departments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4 text-center">
        <Building2 className="h-16 w-16 text-muted-foreground/50" />
        <p className="text-muted-foreground">No departments yet</p>
        <Button
          onClick={() => navigate('/dashboard/master-data/departments')}
          className="bg-primary hover:bg-primary/90 text-white"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Go to Departments
        </Button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-180px)] min-h-[500px] w-full">
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        onNodesChange={onNodesChangeHandler}
        onEdgesChange={onEdgesChangeHandler}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#333', strokeWidth: 3 },
          animated: false,
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        className="bg-background"
      >
        <Controls
          className="!shadow-md !border-border !rounded-lg !bg-card"
          showZoom
          showFitView
          showInteractive={false}
        />
        <MiniMap
          className="!shadow-md !border-border !rounded-lg !bg-card"
          nodeColor="hsl(var(--primary) / 0.2)"
          maskColor="hsl(var(--background) / 0.8)"
        />
        <Panel position="top-left" className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onFitView} className="shadow-sm">
            <Maximize2 className="h-4 w-4 mr-1" />
            Fit view
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/dashboard/master-data/departments')}
            className="shadow-sm"
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Departments
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

const OrgStructureFlow = () => (
  <ReactFlowProvider>
    <OrgStructureFlowInner />
  </ReactFlowProvider>
);

const OrgStructure = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organization Structure</h1>
          <p className="text-muted-foreground text-sm mt-1">
            CEO at top, departments and heads, then managers, supervisors, and staff
          </p>
        </div>
      </div>
      <OrgStructureFlow />
    </div>
  );
};

export default OrgStructure;
