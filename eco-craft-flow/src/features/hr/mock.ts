export type EmployeeStatus = "active" | "probation" | "on_leave" | "resigned";
export type AttendanceStatus = "present" | "late" | "absent" | "half_day" | "leave";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type LeaveType = "Annual" | "Sick" | "Casual" | "Unpaid" | "Maternity";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export interface Employee {
  id: string;
  code: string;
  name: string;
  designation: string;
  department: string;
  phone: string;
  email: string;
  joinedOn: string;
  salary: number;
  shift: "Day" | "Evening" | "Night";
  status: EmployeeStatus;
}

export interface Department {
  id: string;
  name: string;
  head: string;
  headcount: number;
  openings: number;
  monthlyCost: number;
  location: string;
}

export interface AttendanceRow {
  id: string;
  date: string;
  code: string;
  name: string;
  department: string;
  checkIn: string;
  checkOut: string;
  hours: number;
  overtime: number;
  status: AttendanceStatus;
}

export interface LeaveRequest {
  id: string;
  number: string;
  code: string;
  name: string;
  department: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  reason: string;
  approver: string;
  status: LeaveStatus;
}

export const EMP_STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On Leave",
  resigned: "Resigned",
};

export const ATT_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  half_day: "Half Day",
  leave: "On Leave",
};

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const empTone = (s: EmployeeStatus): Tone =>
  s === "active" ? "success" : s === "probation" ? "info" : s === "on_leave" ? "warning" : "neutral";

export const attTone = (s: AttendanceStatus): Tone =>
  s === "present" ? "success" : s === "late" ? "warning" : s === "absent" ? "danger" : s === "half_day" ? "info" : "neutral";

export const leaveTone = (s: LeaveStatus): Tone =>
  s === "approved" ? "success" : s === "pending" ? "warning" : "danger";

export const EMPLOYEES: Employee[] = [
  { id: "e1", code: "EMP-001", name: "Ramesh Shrestha", designation: "QC Manager", department: "Quality Control", phone: "+977 9801-234501", email: "ramesh@ecowrap.com.np", joinedOn: "2021-03-14", salary: 78000, shift: "Day", status: "active" },
  { id: "e2", code: "EMP-002", name: "Sunita Magar", designation: "Production Supervisor", department: "Production", phone: "+977 9801-234502", email: "sunita@ecowrap.com.np", joinedOn: "2020-07-01", salary: 62000, shift: "Day", status: "active" },
  { id: "e3", code: "EMP-003", name: "Bikash Tamang", designation: "Extrusion Operator", department: "Production", phone: "+977 9801-234503", email: "bikash@ecowrap.com.np", joinedOn: "2022-11-20", salary: 34000, shift: "Night", status: "active" },
  { id: "e4", code: "EMP-004", name: "Manish Karki", designation: "QC Inspector", department: "Quality Control", phone: "+977 9801-234504", email: "manish@ecowrap.com.np", joinedOn: "2023-05-09", salary: 38000, shift: "Evening", status: "on_leave" },
  { id: "e5", code: "EMP-005", name: "Prakash Gurung", designation: "Warehouse Keeper", department: "Warehouse", phone: "+977 9801-234505", email: "prakash@ecowrap.com.np", joinedOn: "2019-01-28", salary: 41000, shift: "Day", status: "active" },
  { id: "e6", code: "EMP-006", name: "Anita Thapa", designation: "Sales Executive", department: "Sales", phone: "+977 9801-234506", email: "anita@ecowrap.com.np", joinedOn: "2024-02-11", salary: 45000, shift: "Day", status: "active" },
  { id: "e7", code: "EMP-007", name: "Dipesh Rai", designation: "Purchase Officer", department: "Purchase", phone: "+977 9801-234507", email: "dipesh@ecowrap.com.np", joinedOn: "2025-09-01", salary: 43000, shift: "Day", status: "probation" },
  { id: "e8", code: "EMP-008", name: "Sarita Adhikari", designation: "Accounts Officer", department: "Accounts", phone: "+977 9801-234508", email: "sarita@ecowrap.com.np", joinedOn: "2022-04-18", salary: 49000, shift: "Day", status: "active" },
  { id: "e9", code: "EMP-009", name: "Nabin Lama", designation: "Machine Helper", department: "Production", phone: "+977 9801-234509", email: "nabin@ecowrap.com.np", joinedOn: "2023-08-02", salary: 26000, shift: "Night", status: "active" },
  { id: "e10", code: "EMP-010", name: "Kritika Basnet", designation: "HR Assistant", department: "HR & Admin", phone: "+977 9801-234510", email: "kritika@ecowrap.com.np", joinedOn: "2021-12-06", salary: 36000, shift: "Day", status: "resigned" },
];

export const DEPARTMENTS: Department[] = [
  { id: "d1", name: "Production", head: "Sunita Magar", headcount: 24, openings: 3, monthlyCost: 742000, location: "Plant — Balaju" },
  { id: "d2", name: "Quality Control", head: "Ramesh Shrestha", headcount: 6, openings: 1, monthlyCost: 268000, location: "Plant — Balaju" },
  { id: "d3", name: "Warehouse", head: "Prakash Gurung", headcount: 9, openings: 0, monthlyCost: 312000, location: "Plant — Balaju" },
  { id: "d4", name: "Sales", head: "Anita Thapa", headcount: 7, openings: 2, monthlyCost: 298000, location: "Head Office — Kathmandu" },
  { id: "d5", name: "Purchase", head: "Dipesh Rai", headcount: 4, openings: 0, monthlyCost: 165000, location: "Head Office — Kathmandu" },
  { id: "d6", name: "Accounts", head: "Sarita Adhikari", headcount: 5, openings: 1, monthlyCost: 224000, location: "Head Office — Kathmandu" },
  { id: "d7", name: "HR & Admin", head: "Kritika Basnet", headcount: 3, openings: 1, monthlyCost: 118000, location: "Head Office — Kathmandu" },
];

export const ATTENDANCE: AttendanceRow[] = [
  { id: "a1", date: "2026-08-13", code: "EMP-001", name: "Ramesh Shrestha", department: "Quality Control", checkIn: "08:55", checkOut: "17:35", hours: 8.7, overtime: 0.7, status: "present" },
  { id: "a2", date: "2026-08-13", code: "EMP-002", name: "Sunita Magar", department: "Production", checkIn: "08:48", checkOut: "18:10", hours: 9.4, overtime: 1.4, status: "present" },
  { id: "a3", date: "2026-08-13", code: "EMP-003", name: "Bikash Tamang", department: "Production", checkIn: "22:12", checkOut: "06:05", hours: 7.9, overtime: 0, status: "late" },
  { id: "a4", date: "2026-08-13", code: "EMP-004", name: "Manish Karki", department: "Quality Control", checkIn: "—", checkOut: "—", hours: 0, overtime: 0, status: "leave" },
  { id: "a5", date: "2026-08-13", code: "EMP-005", name: "Prakash Gurung", department: "Warehouse", checkIn: "08:30", checkOut: "17:05", hours: 8.6, overtime: 0.6, status: "present" },
  { id: "a6", date: "2026-08-13", code: "EMP-006", name: "Anita Thapa", department: "Sales", checkIn: "09:40", checkOut: "17:30", hours: 7.8, overtime: 0, status: "late" },
  { id: "a7", date: "2026-08-13", code: "EMP-007", name: "Dipesh Rai", department: "Purchase", checkIn: "—", checkOut: "—", hours: 0, overtime: 0, status: "absent" },
  { id: "a8", date: "2026-08-13", code: "EMP-008", name: "Sarita Adhikari", department: "Accounts", checkIn: "09:00", checkOut: "13:10", hours: 4.2, overtime: 0, status: "half_day" },
  { id: "a9", date: "2026-08-13", code: "EMP-009", name: "Nabin Lama", department: "Production", checkIn: "22:00", checkOut: "06:00", hours: 8, overtime: 0, status: "present" },
  { id: "a10", date: "2026-08-12", code: "EMP-003", name: "Bikash Tamang", department: "Production", checkIn: "21:58", checkOut: "06:02", hours: 8.1, overtime: 0.1, status: "present" },
];

export const LEAVES: LeaveRequest[] = [
  { id: "l1", number: "LV-2608-14", code: "EMP-004", name: "Manish Karki", department: "Quality Control", type: "Sick", from: "2026-08-12", to: "2026-08-15", days: 4, reason: "Viral fever — doctor advised rest", approver: "Ramesh Shrestha", status: "approved" },
  { id: "l2", number: "LV-2608-15", code: "EMP-006", name: "Anita Thapa", department: "Sales", type: "Annual", from: "2026-08-20", to: "2026-08-24", days: 5, reason: "Family trip to Pokhara", approver: "Management", status: "pending" },
  { id: "l3", number: "LV-2608-16", code: "EMP-009", name: "Nabin Lama", department: "Production", type: "Casual", from: "2026-08-16", to: "2026-08-16", days: 1, reason: "Personal work", approver: "Sunita Magar", status: "pending" },
  { id: "l4", number: "LV-2608-17", code: "EMP-003", name: "Bikash Tamang", department: "Production", type: "Unpaid", from: "2026-08-26", to: "2026-08-30", days: 5, reason: "Village visit", approver: "Sunita Magar", status: "rejected" },
  { id: "l5", number: "LV-2608-18", code: "EMP-008", name: "Sarita Adhikari", department: "Accounts", type: "Maternity", from: "2026-09-01", to: "2026-11-29", days: 90, reason: "Maternity leave as per labour act", approver: "Management", status: "approved" },
  { id: "l6", number: "LV-2608-19", code: "EMP-005", name: "Prakash Gurung", department: "Warehouse", type: "Annual", from: "2026-08-18", to: "2026-08-19", days: 2, reason: "Home renovation", approver: "Management", status: "pending" },
];
